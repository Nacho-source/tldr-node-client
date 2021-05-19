'use strict';

const fs = require('fs-extra');
const os = require('os');
const path = require('path');
const remote = require('./remote');
const platform = require('./platform');
const index = require('./index');
const utils = require('./utils');

class Cache {
  constructor(config) {
    // TODO: replace this with a private field when it reaches enough maturity
    // https://github.com/tc39/proposal-class-fields#private-fields
    this.config = config;
    this.cacheFolder = path.join(config.cache, 'cache');
  }

  lastUpdated() {
    return fs.stat(this.cacheFolder);
  }

  async getPage(page) {
    let preferredPlatform = platform.getPreferredPlatformFolder(this.config);
    const preferredLanguage = process.env.LANG || 'en';
    try {
      const folder = await index.findPage(
        page,
        preferredPlatform,
        preferredLanguage
      );
      if (!folder) {
        return;
      }
      let filePath = path.join(this.cacheFolder, folder, `${page}.md`);
      return fs.readFile(filePath, 'utf8');
    } catch (err) {
      console.log(err);
    }
  }

  clear() {
    return fs.remove(this.cacheFolder);
  }

  async update() {
    // Temporary folder path: /tmp/tldr/{randomName}
    const tempFolder = path.join(os.tmpdir(), 'tldr', utils.uniqueId());

    // Downloading fresh copy
    await Promise.all([
      // Create new temporary folder
      fs.ensureDir(tempFolder),
      fs.ensureDir(this.cacheFolder),
    ]);
    // Download and extract cache data to temporary folder
    await remote.download(tempFolder);
    // Copy data to cache folder
    await fs.copy(tempFolder, this.cacheFolder);
    // eslint-disable-next-line no-unused-vars
    const result = await Promise.all([
      // Remove temporary folder
      fs.remove(tempFolder),
      index.rebuildPagesIndex(),
    ]);
    return result[1];
  }
}

module.exports = Cache;
