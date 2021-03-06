/*
 * File: index.js
 * Project: @expresswayjs/expressway
 * File Created: Saturday, 2nd May 2020 4:15:25 pm
 * Author: Temitayo Bodunrin (temitayo@camelcase.co)
 * -----
 * Last Modified: Friday, 19th February 2021 2:22:01 pm
 * Modified By: Temitayo Bodunrin (temitayo@camelcase.co)
 * -----
 * Copyright 2021, CamelCase Technologies Ltd
 */

// Now you can touch, but still dont touch
const path = require('path');
const bodyParser = require('body-parser');
const expressway = require('./app');
const { getFilesArray, isDotFile } = require('../../support/io');
const { isEmpty, endsWith } = require('lodash');

const { app } = expressway;
const { isClass } = use('support');

const configCache = global.configCache;

/**
 * Load and cache configs
 */
const cacheConfig = () => {
    const files = getFilesArray(path.join(appRoot, '/config/'));
    if (files.length) {
        files.forEach((file) => {
            const filename = path.basename(file);
            // Dont read index files, bad omen
            if (filename === 'index.js' || isDotFile(file)) return;
            configCache[filename.replace(/\.js$/, '')] = require(file);
        });
    }
};

/**
 * Load and cache routes
 * @param {Object} app The main app object
 */
const cacheRouters = (app) => {
    const files = getFilesArray(path.join(appRoot, '/routes/'));
    if (files.length) {
        files.forEach((file) => {
            const filename = path.basename(file);

            // Dont read index and error files
            if (
                filename == 'index.js' ||
                filename == 'errors.js' ||
                isDotFile(file)
            )
                return;

            // if (!config('app.debug') && filename == 'test.js') return;

            try {
                const routes = require(file);
                if (routes && !isEmpty(routes)) {
                    app.use(`/${filename.replace(/\.js$/, '')}`, routes);
                }
            } catch (error) {
                throw error;
            }
        });
    }
};

/**
 * Autoload all global middlewares
 * @param {Object} app The main app object
 */
const loadMiddlewares = (app) => {
    const location = path.join(appRoot, '/app/middlewares/global/'),
        loadMiddleware = (middleware) => {
            if (isClass(middleware)) {
                app.use(new middleware().handle());
            } else {
                app.use(middleware());
            }
        },
        globalMiddlewareList = use('/app/middlewares/global');

    if (Array.isArray(globalMiddlewareList) && globalMiddlewareList.length) {
        globalMiddlewareList.forEach((middleware) => {
            // Absolute middleware
            if (middleware.split('/').length > 1) {
                loadMiddleware(require(path.join(appRoot, middleware)));
            } else {
                loadMiddleware(require(`${location}${middleware}`));
            }
        });
        return;
    }

    const files = getFilesArray(location);

    if (files.length) {
        files.forEach((file) => {
            // Dont read index files, bad omen
            if (endsWith(file, 'index.js') || isDotFile(file)) return;
            const middleware = require(`${file}`);
            loadMiddleware(middleware);
        });
    }
};

/**
 * Autoload all service providers
 * @param {Object} app The main app object
 */
const loadServiceProviders = async (app) => {
    const location = path.join(appRoot, '/app/providers/'),
        load = async (provider) => {
            if (isClass(provider)) {
                const p = new provider(app);
                await p.boot();
            } else {
                await provider(app);
            }
        };

    const loadPromises = [];

    if (config('app.autoload_providers', false)) {
        if (!isDirectory(location)) return;
        const files = getFilesArray(location);

        if (files.length) {
            files.forEach(async (provider) => {
                // Dont read index files, bad omen
                if (endsWith(provider, 'index.js') || isDotFile(provider))
                    return;
                loadPromises.push(load(use(`${provider}`)));
            });
        }
    } else {
        const providers = config('app.providers', []);

        if (providers.length) {
            providers.forEach(async (provider) => {
                loadPromises.push(load(use(`${provider}`)));
            });
        }
    }

    return Promise.all(loadPromises);
};

/**
 * Boot the system
 */
expressway.bootstrap = () => {
    // Cache config
    cacheConfig();

    // Modify servers
    require('./server')(app);

    app.boot = async () => {
        // Load features
        await require('./loader')(app);

        app.disable('x-powered-by');

        // BodyParser Obviously
        app.use(bodyParser.json());
        app.use(
            bodyParser.urlencoded({
                extended: true,
            })
        );

        // Cookie Parser
        if (
            config('cookies.enable_cookie_parser', false) ||
            config('cookies.enable_csrf', false)
        ) {
            app.use(require('cookie-parser')(config('app.key')));
        }

        if (config('cookies.enable_csrf', false)) {
            const crsfOptions = {
                cookie: {
                    // key: config('cookies.crsf_token_name', '_crsf'),
                    path: config('cookies.cookie_path', '/'),
                    signed: true,
                    secure: config('cookies.secure_cookie', false),
                    httpOnly: config('cookies.http_only_cookie', false),
                    sameSite: config('cookies.same_site_cookie', true),
                },
                ignoreMethods: config('cookies.csrf_ignored_methods', []),
            };

            if (config('cookies.cookie_max_age', false)) {
                crsfOptions.maxAge = config('cookies.cookie_max_age');
            }

            if (config('cookies.cookie_domain', false)) {
                crsfOptions.domain = config('cookies.cookie_domain');
            }

            global.csrfProtection = require('csurf')(crsfOptions);

            app.use(csrfProtection);

            if (config('cookies.enable_global_csrf', false)) {
                app.use(csrfProtection, (req, res, next) => {
                    const token = req.csrfToken();
                    if (req.method === 'GET') {
                        res.locals[config('cookies.crsf_token_name')] = token;
                        res.cookie(config('cookies.crsf_token_name'), token, {
                            sameSite: true,
                        });
                    }

                    next();
                });
            }

            app.use((err, req, res, next) => {
                if (err.code === 'EBADCSRFTOKEN') {
                    return res.status(403).json({
                        status: false,
                        code: 403,
                        message: 'Forbidden',
                    });
                }
                return next();
            });
        }

        // Load external middlewares before routes
        loadMiddlewares(app);

        // Load service providers
        await loadServiceProviders(app);

        const routes = use('/routes');

        // Routers
        if (routes) app.use('/', routes.main);

        cacheRouters(app);

        // Static files
        const staticLocation = config('app.static_dir');
        if (staticLocation)
            app.use(expressway.static(path.join(appRoot, staticLocation)));

        // Catch all error handler
        app.use(routes.errors);

        // For chainging Purpose
        return app;
    };

    app.serve = (port = null) => {
        return new Promise((resolve, reject) => {
            try {
                const usedPort = port || config('app.port') || 3000;
                app.listen(usedPort, null, () =>
                    console.log(`🚀 Lisening on port ${usedPort}`)
                );
                resolve(app);
            } catch (error) {
                reject(error);
            }
        });
    };

    return app;
};

module.exports = expressway;
