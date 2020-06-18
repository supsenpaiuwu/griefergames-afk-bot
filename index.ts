export {};

const gg = require('griefergames');
const fs = require('fs');
const dateFormat = require('dateformat');
const prompt = require('serverline');
const config = require('./config.json');
const credentials = require('./credentials.json');

let logFile;
if(fs.existsSync('logs/'+dateFormat('dd-mm-yyyy')+'.log')) {
  let counter = 1;
  while(fs.existsSync('logs/'+dateFormat('dd-mm-yyyy')+'-'+counter+'.log')) {
    counter++;
  }
  logFile = fs.openSync('logs/'+dateFormat('dd-mm-yyyy')+'-'+counter+'.log', 'a');
} else {
  logFile = fs.openSync('logs/'+dateFormat('dd-mm-yyyy')+'.log', 'a');
}

let msgresponse = config.msgresponse != '';
let connectErrorCount = 0;
let connectedToCityBuild = false;
let serverKickCounter = 0;
let bot = null;
let onlineTime = 0;
let onlineTimeInterval;

async function startBot() {
  log('Connecting to server...');

  bot = gg.createBot({
    username: credentials.email,
    password: credentials.password,
    cacheSessions: true,
    logMessages: false,
    solveAfkChallenge: true
  });
  
  try {
    await bot.init();
  } catch(err) {
    log('An error occurred: '+err.message);
    exit();
  }
  
  bot.on('ready', async () => {
    log('Connected as '+bot.client.username+'. Trying to connect to CityBuild...');

    // count time bot is on the server in minutes
    onlineTimeInterval = setInterval(() => onlineTime++, 60000);
    
    // connect to citybuild
    if(config.citybuild != '') {
      while(connectErrorCount < 5 && !connectedToCityBuild) {
        const result: any = await connectToCitybuild(config.citybuild);
        if(result.success) {
          connectedToCityBuild = true;
          log('Connected to CityBuild.');
          // wait 2s until fully connected
          setTimeout(() => {
            // execute commands
            config.commands.forEach(cmd => {
              bot.sendCommand(cmd);
            });
          }, 2000);
        } else {
          connectErrorCount++;
          log('Couldn\'t connect to CityBuild: '+result.error);
        }
      }
      if(!connectedToCityBuild) {
        log('Couldn\'t connect to CityBuild 5 times.');
        exit();
      }
    }
  });
  
  // handle kick event
  bot.on('kicked', reason => {
    reason = JSON.parse(reason);
    log('Got kicked from the server: "'+reason.text+'".');

    switch(reason.text) {
      case "§4Der Server wird heruntergefahren.":
        stopBot();
        setTimeout(() => {
          //if(bot == null) startBot();
          startBot();
        }, 1200000); // 20min
        break;
      case "Du bist schon zu oft online!":
        exit();
        break;
      default:
        serverKickCounter++;
        if(serverKickCounter < 5) {
          stopBot();
          //if(bot == null) startBot();
          startBot();
        } else {
          exit();
        }
    }
  });
  
  // handle msg event
  bot.on('msg', (rank, username, message) => {
    if(!msgresponse) return;
    bot.sendMsg(username, config.msgresponse);
  });
  
  // handle chat message event
  let broadcastMessage = false;
  bot.client.on('message', message => {
    // remove messages from ignore list
    if(config.ignoreMessages.includes(message.toString())) {
      return;
    }

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
}

function connectToCitybuild(citybuild) {
  return new Promise(async resolve => {
    const timeout = setTimeout(() => {
      resolve({success: false, error: 'Timed out while connecting to CityBuild.'});
    }, 60000);
    try {
      await bot.connectCityBuild(citybuild);
      clearTimeout(timeout);
      resolve({success: true});
    } catch(err) {
      clearTimeout(timeout);
      resolve({success: false, error: err.message});
    }
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
prompt.setCompletion(['#help', '#stop', '#msgresponse', '#onlinetime', '#listplayers', '#citybuild']);
prompt.on('SIGINT', () => {
  exit();
});
prompt.on('line', async msg => {
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
        log('#listplayers - List the currently online players.');
        log('#citybuild <name> - Change CityBuild.');
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

        case 'citybuild':
          if(args.length == 2) {
            connectedToCityBuild = false;
            connectErrorCount = 0;
            while(connectErrorCount < 5 && !connectedToCityBuild) {
              const result: any = await connectToCitybuild(args[1]);
              if(result.success) {
                connectedToCityBuild = true;
                log('Connected to CityBuild.');
              } else {
                connectErrorCount++;
                log('Couldn\'t connect to CityBuild: '+result.error);
              }
            }
            if(!connectedToCityBuild) {
              log('Couldn\'t connect to CityBuild 5 times.');
            }
          } else {
            log('Usage: #citybuild <name>');
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
  message = '['+time+'] '+message;
  console.log(message);
  fs.appendFileSync(logFile, message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')+'\n');
}