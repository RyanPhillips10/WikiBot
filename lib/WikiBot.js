'use strict';

var util = require('util'),
    path = require('path'),
    fs = require('fs'),
    assert = require('assert'),
    Bot = require('slackbots'),
    MongoClient = require('mongodb').MongoClient,
    assert = require('assert'),
    ObjectId = require('mongodb').ObjectID,
    WikiBot = require('../lib/WikiBot'),
    wikibot = require('nodemw'),
    Mongoose = require('Mongoose');

// Some global variables - should be changed
// to not be global variables
var globalDB;
var GLOBAL_PAGE_LIST = [];

// Connect to MongoDB to store everything. This 
// should be moved to its own file
var url = 'mongodb://localhost:27017/test';
MongoClient.connect(url, function(err, db) {

    assert.equal(null, err);
    console.log("Connected correctly to server.");
    // db.close();
 
    globalDB = db;

});

// Function that loags all wiki pages when node starts,
// This takes a second, which could cause problems if 
// we get requests before pages are loaded form MW. 
function initWikiPages ()
{
    var client = new wikibot({
        server: 'universityinnovation.org',  // host name of MediaWiki-powered site
        path: '',                  // path to api.php script
        debug: false                 // is more verbose when set to true
    });
    client.getAllPages(function (err, res) {
        // error handling
        if (err) {
            console.error(err);
            return;
        }
        
        // Once we know we have all the pages, push their names
        // into a global variable. 
        console.log('-------------- GOT ALL PAGES --------------');
        // console.log(res);
        for (var i = 0; i < res.length; i++) 
        {
            GLOBAL_PAGE_LIST.push(res[i].title);
        }
    });
}



/**
 * Constructor function. It accepts a settings object which should contain the following keys:
 *      token : the API token of the bot (mandatory)
 *      name : the name of the bot (will default to "WikiBot")
 *      dbPath : the path to access the database (will default to "data/WikiBot.db")
 *
 * @param {object} settings
 * @constructor
 *
 * @author Luciano Mammino <lucianomammino@gmail.com>
 */
var WikiBot = function Constructor(settings) {
    this.settings = settings;
    this.settings.name = this.settings.name || 'wikibot';

    // Go to MW and grab all pages
    initWikiPages();
    
    this.user = null;

};

// inherits methods and properties from the Bot constructor
util.inherits(WikiBot, Bot);

/**
 * Run the bot
 * @public
 */
WikiBot.prototype.run = function () {
    WikiBot.super_.call(this, this.settings);

    this.on('start', this._onStart);
    this.on('message', this._onMessage);
};

/**
 * On Start callback, called when the bot connects to the Slack server and access the channel
 * @private
 */
WikiBot.prototype._onStart = function () {
    this._loadBotUser();
};

/**
 * On message callback, called when a message (of any type) is detected with the real time messaging API
 * @param {object} message
 * @private
 */
WikiBot.prototype._onMessage = function (message) {
    // console.log(message);

    // Log the full message object in Mongo
    this._insertLog(message, 'slacklogs');
    // console.log(message);
    if ((this._isChatMessage(message) ||
        this._isChannelConversation(message) ) &&
        !this._isFromWikiBot(message) && 
        this._isReferencingBot(message)) 
    {
        if (message.type == 'message') {
            this._basicProcess(message);
        }   
    }
};



// a private function that uses REGEX to parse the message
// the user has sent and process. This should be replaced
// with natural language processesing, but website
// was buggy during testing. 
WikiBot.prototype._basicProcess = function (originalMessage)
{
    console.log("===== Begin: Basic Process");
    var myWikiRegex = /wiki/;
    // if (myWikiRegex.exec(originalMessage.text))
    // {
        console.log('contains wiki');

        // Get search query
        var myRe = /:.*\?/;

        var myArray = (myRe.exec(originalMessage.text))[0].split(' ').splice(1).join(' ').slice(0, -1);
        console.log(myArray);
        this._basicWikiProcess(originalMessage, myArray);
    // }
    console.log("===== End: Basic Process");
}

// If the command is a wiki command, send back some pages or suggest 
// the user create a new one. 
WikiBot.prototype._basicWikiProcess = function (originalMessage, searchQuery)
{
    console.log('===== Begin: Basic Query UIFellows Wiki');
    var self = this;
    var returnMessage = '';
    // searchQuery = searchQuery.toLowerCase();
    console.log(GLOBAL_PAGE_LIST.length);
    for (var j = 0; j < GLOBAL_PAGE_LIST.length; j++) 
    {
        var result = (GLOBAL_PAGE_LIST[j].toLowerCase()).match(searchQuery.toLowerCase());

        if (result != null)
        {
            returnMessage = returnMessage + 'http://universityinnovation.org/wiki/' + GLOBAL_PAGE_LIST[j].split(' ').join('_') + '\n';
        }
    }
    
    var channel = self._getChannelById(originalMessage.channel);
    
    // pass configuration object

    var client = new wikibot({
        server: 'universityinnovation.org',  // host name of MediaWiki-powered site
        path: '',                  // path to api.php script
        debug: true                 // is more verbose when set to true
    });

    // The output from this query is ignored, but was too lazy to change
    // it back. Ideally, we query only when the user asks and we can remove
    // the 'GetAllPages()' call at the beginning. 
    client.getArticle(searchQuery, function(err, data) {
        // error handling
        
        // If there is an error, do nothing
        // 
        // TODO: return some nice message to user
        if (err) {
            console.error(err);
            return;
        }

        // If there is at least 1 page, send it to user
        else if (returnMessage != '')
        {
            self.postMessageToChannel(channel.name, 'Check out ' + returnMessage, {as_user: true});
        }

        // If there are no pages, suggest user create it
        else 
        {
            searchQuery = searchQuery.split(' ').join('_');
            self.postMessageToChannel(channel.name, 'Page doesnt exist, create it at: http://universityinnovation.org/wiki/' + searchQuery, {as_user: true});
        }
    });

    console.log('===== End: Basic Query UIFellows Wiki');
}

/**
 * Loads the user object representing the bot
 * @private
 */
WikiBot.prototype._loadBotUser = function () {
    var self = this;
    this.user = this.users.filter(function (user) {
        return user.name === self.name;
    })[0];
};

/**
 * Sends a welcome message in the channel
 * @private
 */
WikiBot.prototype._welcomeMessage = function () {
    this.postMessageToChannel(this.channels[0].name, 'Hi guys, roundhouse-kick anyone?' +
        '\n I can tell jokes, but very honest ones. Just say `Chuck Log` or `' + this.name + '` to invoke me!',
        {as_user: true});
};

/**
 * Util function to check if a given real time message object represents a chat message
 * @param {object} message
 * @returns {boolean}
 * @private
 */
WikiBot.prototype._isChatMessage = function (message) {
    return message.type === 'message' && Boolean(message.text);
};

/**
 * Util function to check if a given real time message object is directed to a channel
 * @param {object} message
 * @returns {boolean}
 * @private
 */
WikiBot.prototype._isChannelConversation = function (message) {
    return typeof message.channel === 'string' &&
        message.channel[0] === 'C'
        ;
};

/**
 * Util function to check if a given real time message is mentioning Chuck Log or the WikiBot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
WikiBot.prototype._isMentioningChuckLog = function (message) {
    return message.text.toLowerCase().indexOf('chuck Log') > -1 ||
        message.text.toLowerCase().indexOf(this.name) > -1;
};

/**
 * Util function to check if a given real time message has ben sent by the WikiBot
 * @param {object} message
 * @returns {boolean}
 * @private
 */
WikiBot.prototype._isFromWikiBot = function (message) {
    return message.user === this.user.id;
};

// Determine if the message is calling the wikibot
WikiBot.prototype._isReferencingBot = function (message) {
    
    var myWikiRegex = /^WikiBot:/i;
    if (myWikiRegex.exec(message.text))
    {
        return true;
    }

    return false;
};

/**
 * Util function to get the name of a channel given its id
 * @param {string} channelId
 * @returns {Object}
 * @private
 */
WikiBot.prototype._getChannelById = function (channelId) {
    return this.channels.filter(function (item) {
        return item.id === channelId;
    })[0];
};

// Insert a log into a specific collection in Mongo. 
WikiBot.prototype._insertLog = function (obj, collection)
{
    globalDB.collection(collection).insertOne( obj, 
    function(err, result) {
        assert.equal(err, null);
        console.log("Inserted a document into the slacklogs collection.");
        // callback();
    });
};


module.exports = WikiBot;
