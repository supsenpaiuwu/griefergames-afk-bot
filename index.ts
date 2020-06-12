export {};

const gg = require('griefergames');
const dateFormat = require('dateformat');
const prompt = require('serverline');
const config = require('./config.json');
const credentials = require('./credentials.json');

let msgresponse = config.msgresponse != '';
let portalErrorCounter;
let bot = null;
let onlineTime = 0;
let onlineTimeInterval;

async function startBot() {
  portalErrorCounter = 0;

  log('Connecting to server...');

  bot = gg.createBot({
    username: credentials.email,
    password: credentials.password,
    cacheSessions: true,
    logMessages: false
  });
  
  await bot.init();
  
  bot.on('ready', async () => {
    log('Connected. Trying to connect to CityBuild...');

    // count time bot is on the server in minutes
    onlineTimeInterval = setInterval(() => onlineTime++, 60000);
    
    // connect to citybuild
    process.on('uncaughtException', err => {
      if(err.message == 'Timed out while connecting on CityBuild.') {
        connectError(err.message);
      } else {
        throw err;
      }
    });

    try {
      await bot.connectCityBuild(config.citybuild);

      log('Connected to CityBuild.');
      // wait 2s until fully connected
      setTimeout(() => {
        // execute commands
        config.commands.forEach(cmd => {
          bot.sendCommand(cmd);
        });
      }, 2000);
    } catch(err) {
      connectError(err.message);
    }

    function connectError(msg: String) {
      log('Can\'t connect to CityBuild: "'+msg+'" Attempting to reconnect in 1 minute.');

      stopBot();

      portalErrorCounter++;
      if(portalErrorCounter >= 5) {
        log('Can\'t connect to CityBuild 5 times.');
        exit();
      }

      setTimeout(() => {
        if(bot == null) startBot();
      }, 60000);
    }
  });
  
  // register kick event
  bot.on('kicked', reason => {
    log('Got kicked from the server: "'+JSON.parse(reason).text+'" Attempting to reconnect in 20 minutes.');

    stopBot();

    setTimeout(() => {
      if(bot == null) startBot();
    }, 1200000);
  });
  
  // register msg event
  bot.on('msg', (rank, username, message) => {
    if(!msgresponse) return;
    bot.sendMsg(username, config.msgresponse);
  });
  
  // register chat message event
  let broadcastMessage = false;
  bot.client.on('message', message => {
    // remove empty lines
    if(message.toString().trim() == '') return;

    // remove broadcast messages
    if(message.toString() == '------------ [ News ] ------------') {
      // begin/end of broadcast
      broadcastMessage = !broadcastMessage;
      return;
    }
    if(broadcastMessage) {
      // text of broadcast
      return;
    }

    log('[Chat] '+message.toAnsi())
  });

  // register error event (not realy used)
  bot.on('error', err => {
    log('An error occurred: '+err);
  });
}

function stopBot() {
  if(bot != null) {
    bot.removeAllListeners();
    bot.clean();
    bot = null;
  }
  clearInterval(onlineTimeInterval);
}

function exit() {
  log(`Stopping bot... (Online time: ${Math.round(onlineTime / 60)}h ${onlineTime % 60}min)`);
  if(bot != null) bot.clean();
  setTimeout(() => process.exit(), 100);
}

startBot();

// command prompt
prompt.init();
prompt.setCompletion(['#help', '#stop', '#msgresponse', '#onlinetime', '#listplayers']);
prompt.on('SIGINT', () => {
  exit();
});
prompt.on('line', msg => {
  if(msg.trim().startsWith('#')) {
    // bot commands
    const args = msg.trim().substr(1).split(' ');
    switch(args[0].toLowerCase()) {
      case 'help':
        log('Available commands:');
        log('#help - Print this list.');
        log('#stop - Stop the bot.');
        log('#msgresponse [on|off] - Enable / Disable automatic response to private messages.');
        log('#onlinetime - Shows the online time of the bot.');
        log('#listplayers - List the currently online players.')
        break;

      case 'stop':
        exit();
        break;
      
      case 'msgresponse':
        if(args.length == 1) {
          log('Automatic response is '+(msgresponse ? 'on.' : 'off.'));
        } else {
          if(args[1].toLowerCase() == 'on') {
            if(config.msgresponse != '') {
              msgresponse = true;
              log('Turned on automatic response.');
            } else {
              log('No response specified in config file.')
            }
          } else if(args[1].toLowerCase() == 'off') {
            msgresponse = false;
            log('Turned off automatic response.');
          } else {
            log('Usage: #msgresponse [on|off]');
          }
        }
        break;

      case 'onlinetime':
        log(`Bot is running for ${Math.round(onlineTime / 60)}h ${onlineTime % 60}min.`)
        break;

      case 'listplayers':
        if(bot != null && bot.isOnline()) {
          const list = [];
          Object.keys(bot.client.players).forEach(player => {
            list.push(player);
          });
          log('Online players: '+list.join(', '));
        } else {
          log('Bot is not connected to server.')
        }
        break;

      default:
        log('Unknown command "#'+args[0]+'". View available commands with #help');
    }
  } else {
    // minecraft chat
    if(bot != null && bot.isOnline()) {
      bot.sendChat(msg);
    } else {
      log('Bot is not connected to server.')
    }
  }
});


function log(message: String) {
  const time = dateFormat(new Date(), 'HH:MM:ss');
  console.log('['+time+'] '+message);
}