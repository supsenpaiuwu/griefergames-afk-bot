export {};

const fs = require('fs');

// the boundingBox of nether portals and carpets have to be changed to empty
const minecraft_data_blocks = require('./node_modules/minecraft-data/minecraft-data/data/pc/1.8/blocks.json');
let changed = false;
for(let i=0; i<minecraft_data_blocks.length; i++) {
  if(minecraft_data_blocks[i].id == 90 || minecraft_data_blocks[i].id == 171) {
    if(minecraft_data_blocks[i].boundingBox != 'empty') {
      minecraft_data_blocks[i].boundingBox = 'empty';
      changed = true;
    }
  }
}
if(changed) fs.writeFileSync('./node_modules/minecraft-data/minecraft-data/data/pc/1.8/blocks.json', JSON.stringify(minecraft_data_blocks, null, 4));

const gg = require('griefergames');
const dateFormat = require('dateformat');
const prompt = require('serverline');
const yargs = require('yargs');

const cityBuildConnectLimit = 3;
const serverKickLimit = 3;

let config;
let credentials;
let bot;
let onlineTimeInterval;
let connectingToCityBuild = false;
let currentCityBuild = 'Offline';
let serverKickCounter = 0;
let onlineTime = 0;

const argv = yargs
  .option('profile', {
    alias: 'p',
    description: 'The config profile.',
    type: 'string',
  })
  .help()
  .alias('help', 'h')
  .argv;

let profile = argv.profile != null ? argv.profile : 'default';
loadConfig();
loadCredentials();

let logFile;
if(config.logMessages) {
  if(fs.existsSync('logs/'+dateFormat('dd-mm-yyyy')+'.log')) {
    let counter = 1;
    while(fs.existsSync('logs/'+dateFormat('dd-mm-yyyy')+'-'+counter+'.log')) {
      counter++;
    }
    logFile = fs.openSync('logs/'+dateFormat('dd-mm-yyyy')+'-'+counter+'.log', 'a');
  } else {
    logFile = fs.openSync('logs/'+dateFormat('dd-mm-yyyy')+'.log', 'a');
  }
}

async function startBot() {
  log('Connecting to server...');

  bot = gg.createBot({
    username: credentials.email,
    password: credentials.password,
    cacheSessions: true,
    logMessages: false,
    solveAfkChallenge: true,
    setPortalTimeout: false
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
      connectingToCityBuild = true;
      let connectErrorCount = 0;
      while(connectErrorCount < cityBuildConnectLimit && connectingToCityBuild) {
        const result: any = await connectToCitybuild(config.citybuild);
        if(result.success) {
          connectingToCityBuild = false;
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
      if(connectErrorCount >= cityBuildConnectLimit) {
        log('---------------------------------------------');
        log('Couldn\'t connect to CityBuild '+cityBuildConnectLimit+' times.');
        exit();
      }
    }
  });
  
  // handle kick event
  const ChatMessage = require('prismarine-chat')(bot.client.version);
  bot.on('kicked', reason => {
    reason = new ChatMessage(JSON.parse(reason));
    log('Got kicked from the server: '+reason.toAnsi());

    switch(reason.toString()) {
      case "Der Server wird heruntergefahren.":
        stopBot();
        if(!config.reconnectAfterRestart) {
          exit();
          break;
        }
        setTimeout(() => {
          startBot();
        }, 1200000); // 20min
        break;
      case "Du bist schon zu oft online!":
        exit();
        break;
      default:
        serverKickCounter++;
        if(serverKickCounter < serverKickLimit) {
          stopBot();
          setTimeout(() => {
            startBot();
          }, 5000);
        } else {
          log('---------------------------------------------');
          log('Got kicked from the server '+serverKickLimit+' times.');
          exit();
        }
    }
  });

  bot.end('end', () => {
    console.log('DEBUG: Session ended.');
  });
  
  // handle msg event
  bot.on('msg', (rank, username, message) => {
    if(config.authorisedPlayers.includes(username)) {
      // Authorised players
      const cmd = message.split(' ');
      switch(cmd[0]) {
        case 'logout':
          config.authorisedPlayers = config.authorisedPlayers.filter(e => e !== username);
          bot.sendMsg(username, 'Du bist nun abgemeldet.');
          break;
        case 'chat':
          if(cmd.length >= 2) {
            cmd.shift()
            bot.sendChat(cmd.join(' '));
          } else {
            bot.sendMsg(username, 'Verwendung: chat <Nachricht|Befehl>');
          }
          break;
        case 'stop':
          bot.sendMsg(username, 'Bot wird beendet.');
          exit();
          break;

        case 'dropinv':
          dropInventory();
          break;
          
        default:
          bot.sendMsg(username, `Der Befehl "${message}" wurde nicht gefunden.`);
      }
    } else {
      // Not authorised players
      if(message.startsWith('login')) {
        const cmd = message.split(' ');
        if(cmd.length == 2 && cmd[1] === credentials.controlPassword) {
          config.push(username);
          bot.sendMsg(username, 'Hey, du bist nun angemeldet.');
        } else {
          bot.sendMsg(username, 'Das Passwort ist nicht korrekt!')
        }
      } else if(config.msgResponseActive) {
        bot.sendMsg(username, config.msgResponse);
      }
    }
  });
  
  // handle chat message event
  let broadcastMessage = false;
  bot.client.on('message', message => {
    // remove messages from ignore list
    for(let i=0; i<config.ignoreMessages.length; i++) {
      if(message.toString().startsWith(config.ignoreMessages[i])) {
        return;
      }
    }

    // remove empty lines
    if(message.toString().trim() == '') return;

    // remove broadcast messages
    if(message.toString() == '------------ [ News ] ------------') {
      broadcastMessage = !broadcastMessage;
      return;
    }
    if(broadcastMessage) {
      return;
    }

    log('[Chat] '+message.toAnsi(), config.displayChat);
  });

  bot.on('tpa', (rank, name) => {
    if(config.authorisedPlayers.includes(name)) {
      bot.sendCommand('tpaccept '+name);
    }
  });

  bot.on('tpahere', (rank, name) => {
    if(config.authorisedPlayers.includes(name)) {
      bot.sendCommand('tpaccept '+name);
    }
  });

  bot.client._client.on('packet', (data, metadata) => {
    if (metadata.name == 'scoreboard_team') {
      if(data.team == 'server' && data.prefix != null) {
        currentCityBuild = data.prefix;
      }
    }
  });
}

function connectToCitybuild(citybuild: string) {
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
  connectingToCityBuild = false;
  currentCityBuild = 'Offline';
  clearInterval(onlineTimeInterval);
}

function exit() {
  log(`Stopping bot... (Online time: ${Math.round(onlineTime / 60)}h ${onlineTime % 60}min)`);
  if(bot != null) bot.clean();
  setTimeout(() => process.exit(), 100);
}

function dropInventory() {
  return new Promise(async resolve => {
    await asyncForEach(bot.client.inventory.items(), async item => {
        await new Promise(resolve1 => {
            bot.client.tossStack(item, resolve1);
        });
    });
    resolve();
  });
}

function loadConfig() {
  try {
    const configFile = JSON.parse(fs.readFileSync('./config.json'));
    config = Object.assign(configFile.default, configFile[profile]);
    config.msgResponseActive = config.msgResponse != '';
  } catch(err) {
    log('Couldn\'t load config: '+err.message);
  }
}
function loadCredentials() {
  const credentialsFile = JSON.parse(fs.readFileSync('./credentials.json'));
  credentials = credentialsFile[config.account];
}

startBot();

// command prompt
prompt.init();
prompt.setCompletion(['#help', '#stop', '#msgresponse', '#togglechat', '#onlinetime', '#listplayers', '#citybuild', '#authorise', '#unauthorise',
  '#listauthorised', '#dropinv', '#reloadconfig', '#currentcb']);
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
        log('#msgresponse [on|off] - Enable or disable automatic response to private messages.');
        log('#togglechat - Show or hide the chat.');
        log('#onlinetime - Show the online time of the bot.');
        log('#listplayers - List the currently online players.');
        log('#citybuild <cb name> - Change CityBuild.');
        log('#authorise <name> - Authorise a player to execute bot commands.');
        log('#unauthorise <name> - Unauthorise a player.');
        log('#listauthorised - List the authorised players.');
        log('#dropinv - Let the bot drop all items in its inventory.');
        log('#reloadconfig - Reload the configuration file.');
        log('#currentcb - Displays the current CityBuild of the bot.')
        break;

      case 'stop':
        exit();
        break;
      
      case 'msgresponse':
        if(args.length == 1) {
          log('Automatic response is '+(config.msgResponseActive ? 'on.' : 'off.'));
        } else {
          if(args[1].toLowerCase() == 'on') {
            if(config.msgResponse != '') {
              config.msgResponseActive = true;
              log('Turned on automatic response.');
            } else {
              log('No response specified in config file.')
            }
          } else if(args[1].toLowerCase() == 'off') {
            config.msgResponseActive = false;
            log('Turned off automatic response.');
          } else {
            log('Usage: #msgresponse [on|off]');
          }
        }
        break;

      case 'togglechat':
        config.displayChat = !config.displayChat;
        log((config.displayChat ? 'Enabled' : 'Disabled')+' chat messages.');
        break;

      case 'onlinetime':
        log(`Bot is running for ${Math.round(onlineTime / 60)}h ${onlineTime % 60}min.`)
        break;

      case 'listplayers':
        if(bot != null && bot.isOnline()) {
          const list = Object.keys(bot.client.players);
          log('Online players ('+list.length+'): '+list.join(', '));
        } else {
          log('Bot is not connected to server.')
        }
        break;

      case 'citybuild':
        if(args.length == 2) {
          if(!connectingToCityBuild) {
            connectingToCityBuild = true;
            let connectErrorCount = 0;
            while(connectErrorCount < cityBuildConnectLimit && connectingToCityBuild) {
              const result: any = await connectToCitybuild(args[1]);
              if(result.success) {
                connectingToCityBuild = false;
                log('Connected to CityBuild.');
              } else {
                connectErrorCount++;
                if(result.error.startsWith('There is no CityBuild named')) {
                  log(result.error);
                  connectingToCityBuild = false;
                } else {
                  log('Couldn\'t connect to CityBuild: '+result.error);
                }
              }
            }
            if(connectErrorCount >= cityBuildConnectLimit) {
              log('Couldn\'t connect to CityBuild '+cityBuildConnectLimit+' times.');
            }
          } else {
            log('Already connecting to citybuild. Please wait...');
          }
        } else {
          log('Usage: #citybuild <cb name>');
        }
        break;

      case 'authorise':
        if(args.length == 2) {
          if(!config.authorisedPlayers.includes(args[1])) {
            config.authorisedPlayers.push(args[1]);
            log('Authorised the player '+args[1]+'.');
          } else {
            log('The player is already authorised.');
          }
        } else {
          log('Usage: #authorise <name>');
        }
        break;

      case 'unauthorise':
        if(args.length == 2) {
          if(config.authorisedPlayers.includes(args[1])) {
            config.authorisedPlayers = config.authorisedPlayers.filter(e => e !== args[1]);
            log('Removed the player '+args[1]+'.');
          } else {
            log('The player is not authorised.');
          }
        } else {
          log('Usage: #unauthorise <name>');
        }
        break;

      case 'listauthorised':
        log('Authorised players: '+config.authorisedPlayers.join(', '));
        break;

      case 'dropinv':
        dropInventory();
        break;

      case 'reloadconfig':
        loadConfig();
        log('Configuration reloaded.');
        break;

      case 'currentcb':
        log('Your current CityBuild: '+currentCityBuild);
        break;

      default:
        log('Unknown command "#'+args[0]+'". View available commands with #help');
    }
  } else {
    // minecraft chat
    if(bot != null && bot.isOnline()) {
      bot.sendChat(msg);
    } else {
      log('Bot is not connected to server.');
    }
  }
});


function log(message: string, display: Boolean = true) {
  const time = dateFormat(new Date(), 'HH:MM:ss');
  message = '['+time+'] '+message;
  if(display) console.log(message);
  if(config.logMessages) fs.appendFileSync(logFile, message.replace(/[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><]/g, '')+'\n');
}

async function asyncForEach(array, callback) {
  for (let index = 0; index < array.length; index++) {
    await callback(array[index], index, array);
  }
}