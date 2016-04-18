#!/usr/bin/env node
// 
'use strict';

/**
 * logBot launcher script.
 *
 * @author Luciano Mammino <lucianomammino@gmail.com>
 */


// var DB = require('../lib/db'),
var WikiBot = require('../lib/WikiBot');

/**
 * Environment variables used to configure the bot:
 *
 *  BOT_API_KEY : the authentication token to allow the bot to connect to your slack organization. You can get your
 *      token at the following url: https://<yourorganization>.slack.com/services/new/bot (Mandatory)
 *  BOT_DB_PATH: the path of the SQLite database used by the bot
 *  BOT_NAME: the username you want to give to the bot within your organisation.
 */

var token = process.env.BOT_API_KEY || require('../token');
var name = process.env.BOT_NAME;

var WikiBot = new WikiBot({
    token: token,
    DB: 'mongodb://localhost:27017/test',
    name: name
});

WikiBot.run();


