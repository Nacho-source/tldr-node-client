'use strict';

const sample = require('lodash/sample');
const fs = require('fs-extra');
const ms = require('ms');
const ora = require('ora');
const { EmptyCacheError, MissingPageError } = require('./errors');
const Cache = require('./cache');
const search = require('./search');
const platform = require('./platform');
const parser = require('./parser');
const render = require('./render');

const index = require('./index');

const spinningPromise = async (text, promise) => {
  const spinner = ora();
  spinner.start(text);
  try {
    const val = await promise();
    spinner.succeed();
    return val;
  } catch (err) {
    spinner.fail();
    throw err;
  }
};

class Tldr {
  constructor(config) {
    // TODO: replace this with a private field when it reaches enough maturity
    // https://github.com/tc39/proposal-class-fields#private-fields
    this.config = config;
    this.cache = new Cache(this.config);
  }

  async list(singleColumn) {
    const os = platform.getPreferredPlatformFolder(this.config);
    const commands = await index.commandsFor(os);
    return await this.printPages(commands, singleColumn);
  }

  async listAll(singleColumn) {
    const commands = await index.commands();
    return await this.printPages(commands, singleColumn);
  }

  get(commands, options) {
    return this.printBestPage(commands.join('-'), options);
  }

  async random(options) {
    const os = platform.getPreferredPlatformFolder(this.config);
    try {
      const pages = await index.commandsFor(os);
      if (pages.length === 0) {
        new EmptyCacheError();
      }
      const page = sample(pages);
      console.log('PAGE', page);
      return this.printBestPage(page, options);
    } catch (err) {
      console.log(err);
    }
  }

  async randomExample() {
    const os = platform.getPreferredPlatformFolder(this.config);
    try {
      const pages = await index.commandsFor(os);
      if (pages.length === 0) {
        new EmptyCacheError();
      }
      const page = sample(pages);
      console.log('PAGE', page);
      return this.printBestPage(page, { randomExample: true });
    } catch (err) {
      console.error(err);
    }
  }

  async render(file) {
    const content = await fs.readFile(file, 'utf8');
    // Getting the shortindex first to populate the shortindex var
    await index.getShortIndex();
    this.renderContent(content);
  }

  async clearCache() {
    await this.cache.clear();
    console.log('Done');
  }

  async updateCache() {
    await spinningPromise('Updating...', () => {
      this.cache.update();
    });
  }

  async updateIndex() {
    await spinningPromise('Creating index...', () => {
      search.createIndex();
    });
  }

  async search(keywords) {
    const results = await search.getResults(keywords.join(' '));
    // TODO: make search into a class also.
    await search.printResults(results, this.config);
  }

  async printPages(pages, singleColumn) {
    if (pages.length === 0) {
      throw new EmptyCacheError();
    }
    await this.checkStale();
    const endOfLine = require('os').EOL;
    const delimiter = singleColumn ? endOfLine : ', ';
    console.log('\n' + pages.join(delimiter));
  }

  async printBestPage(command, options = {}) {
    // Trying to get the page from cache first
    let content = await this.cache.getPage(command);
    // If found in first try, render it
    if (!content) {
      // If not found, try to update
      await spinningPromise('Page not found. Updating cache...', () => {
        return this.cache.update();
      });
      await spinningPromise('Creating index...', () => {
        return search.createIndex();
      });
      // And then, try to check in cache again
      content = await this.cache.getPage(command);
    }
    if (!content) {
      throw new MissingPageError(this.config.pagesRepository);
    }
    await this.checkStale();
    this.renderContent(content, options);
  }

  async checkStale() {
    const stats = await this.cache.lastUpdated();
    stats.mtime < Date.now() - ms('30d') &&
      console.warn('Cache is out of date. You should run "tldr --update"');
  }

  renderContent(content, options = {}) {
    if (options.markdown) {
      return console.log(content);
    }
    const page = parser.parse(content);
    if (options && options.randomExample === true) {
      page.examples = [sample(page.examples)];
    }
    const output = render.toANSI(page, this.config);
    if (output) {
      console.log(output);
    }
  }
}

module.exports = Tldr;
