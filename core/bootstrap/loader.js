/*
 * File: loader.js
 * Project: @expresswayjs/expressway
 * File Created: Saturday, 30th May 2020 6:16:45 am
 * Author: Temitayo Bodunrin (temitayo@camelcase.co)
 * -----
 * Last Modified: Saturday, 24th October 2020 3:39:41 pm
 * Modified By: Temitayo Bodunrin (temitayo@camelcase.co)
 * -----
 * Copyright 2020, CamelCase Technologies Ltd
 */

/**
 * @vars {Array} backend
 * This is the backends to autoload at startup
 * Some of these backends are cached in memory
 * Others are lazy loaded when needed
 * it is better to load dependencies that install modules at runtime first
 */
const backends = config('app.modules') || ['mail', 'database', 'caching'];

const loadBackends = async () => {
    // Load facaded before other modules are loaded
    const facades = config('app.facades', {}),
        facadeKeys = Object.keys(facades);
    if (facadeKeys.length) {
        const { facade } = use('support');
        Object.keys(facades).forEach((f) => {
            global[f] = facade(use(facades[f]));
        });
    }

    /**
     * For each of the modules to load, call their loader function
     * Modules can be either local to the core or global module that can
     * either be local to the application or from node_modules
     * Each loader must return a promise
     * Stack them all in promise so that they are loaded in order
     */
    const loadPromises = backends.map((backend) => {
        // Dot or slash notation means the backend
        // is an absolute path in either node_modules
        // or relative to the application
        if (backend.split(/[\/|\.]/).length === 1)
            return require(`../${backend}/loader`)();
        return require(`${backend}/loader`)();
    });
    return Promise.all(loadPromises);
};

module.exports = loadBackends;
