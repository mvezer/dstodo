#!/usr/bin/env node
const fs = require('fs');

const HOME_DIR = require('os').homedir();
const COMMENT_CHR = '#';
const CONFIG_LOCATION = [
  HOME_DIR + '/.config/dstodo/config',
  HOME_DIR + '/.dstodo/config',
  HOME_DIR + '/.dstodo.cfg',
  __dirname + '/config'
];
const DEFAULT_DATE_FORMAT = 'dd-mm-yyy';
let todoBuffer = [];
let doneBuffer = [];

// ---------- basic functions
const loadFile = (fName) => {
  let buffer;
  try {
    buffer = fs.readFileSync(fName, 'utf8');
  } catch (error) {
    console.log(`Error: could not read file '${fName}'`);
    process.exit(1);
  }
  return buffer.split('\n')
}
const loadBuffer = (fName) => {
  return loadFile(fName).map(extractLine);
}
const saveBuffer = (fName, buffer) => {
  try {
    fs.writeFileSync(
      fName,
      buffer
        .map(compressLine)
        .join('\n'),
      'utf8'
    );
  } catch (error) {
    console.log(`Error: could not write file '${fName}'`);
    process.exit(1);
  }
}
const fileExists = (fName) => {
  return fs.existsSync(fName);
}

const findConfig = () => {
  let cfgIndex = 0;
  while (cfgIndex < CONFIG_LOCATION.length && !fs.existsSync(CONFIG_LOCATION[cfgIndex])) {
    cfgIndex++;
  }
  return cfgIndex < CONFIG_LOCATION.length ? CONFIG_LOCATION[cfgIndex] : '';
}
const stripComments = (line) => {
  const commentIndex = String(line).indexOf(COMMENT_CHR);
  if (commentIndex == -1) {
    return line;
  }
  
  return String(line).substring(0, commentIndex);
}
const parseIni = (iniArr) => {
  const iniMap = new Map();
  iniArr
    .forEach((rawLine, lineIndex) => {
      const strippedLine = stripComments(rawLine)
        .trimStart()
        .trimEnd();
      if (strippedLine.length) {
        const lineArr = strippedLine
          .split('=')
          .map(l => String(l).trimStart().trimEnd())
        if (lineArr.length < 2) {
          console.log(`WARNING: config '${configFile}' has error at line ${lineIndex}`);
        } else {
          const key = lineArr[0];
          const value = String(lineArr[1])
            .replace('~', HOME_DIR)
            .replace('$HOME', HOME_DIR);
          iniMap.set(key, value);
        }
      }
    });
  return iniMap;
}

const parseCommand = (commandStr) => {
  let cmdIndex = 0;
  while (cmdIndex < COMMAND_MAP.length && !COMMAND_MAP[cmdIndex].aliases.includes(commandStr)) {
    cmdIndex++;
  }
  return cmdIndex < COMMAND_MAP.length ? COMMAND_MAP[cmdIndex] : null; 
}

// ---------- date manipulation
const formatDate = (dateTime) => {
  const dayStart = dateFormat.indexOf('d');
  const dayStop = dateFormat.lastIndexOf('d') + 1;
  const dayStr = dateFormat.slice(dayStart, dayStop);
  const monthStart = dateFormat.indexOf('m');
  const monthStop = dateFormat.lastIndexOf('m') + 1;
  const monthStr = dateFormat.slice(monthStart, monthStop);
  const yearStart = dateFormat.indexOf('y');
  const yearStop = dateFormat.lastIndexOf('y') + 1;
  const yearStr = dateFormat.slice(yearStart, yearStop);
  return dateFormat
    .replace(dayStr, String(dateTime.getDate()).padStart(dayStr.length, '0'))
    .replace(monthStr, String(dateTime.getMonth() + 1).padStart(monthStr.length, '0'))
    .replace(yearStr, String(dateTime.getFullYear()).padStart(yearStr.length, '0'));
}
const getWeekdayFromDateTime = (dateTime) => {
  let dayIdx = dateTime.getDay() - 1;
  if (dayIdx < 0) {
    dayIdx = 6;
  }
  return WEEKDAY_MAP[dayIdx];
}
const parseWeekday = (dayStr) => {
  let dayIdx = 0;
  while (dayIdx < WEEKDAY_MAP.length && !WEEKDAY_MAP[dayIdx].aliases.includes(String(dayStr).toLowerCase())) {
    dayIdx++;
  }
  return dayIdx < WEEKDAY_MAP.length ? WEEKDAY_MAP[dayIdx] : null;
}
const parseDate = (dateStr) => {
  const str = dateStr.toLowerCase();
  const today = new Date();
  if ([ 'today', 'tday' ].includes(str)) {
    return today;
  }
  if (str === 'tomorrow') {
    const tomorroTSw = (new Date()).setDate(today.getDate() + 1);
    return new Date(tomorrowTS);
  }
  if ([ 'nextweek', 'nweek' ].includes(str)) {
    const nextweekTS = (new Date()).setDate(today.getDate() + 7);
    return new Date(nextweekTS);
  }
  const wDay = parseWeekday(str);
  if (wDay) {
    const todayWeekDay = getWeekdayFromDateTime(today);
    const increment = todayWeekDay.offset <= wDay.offset
      ? wDay.offset - todayWeekDay.offset
      : wDay.offset - todayWeekDay.offset + 7;

    const targetDayTS = (new Date()).setDate(today.getDate() + increment);
    return new Date(targetDayTS);
  }
  const dayStart = dateFormat.indexOf('d');
  const dayStop = dateFormat.lastIndexOf('d') + 1;
  const monthStart = dateFormat.indexOf('m');
  const monthStop = dateFormat.lastIndexOf('m') + 1;
  const yearStart = dateFormat.indexOf('y');
  const yearStop = dateFormat.lastIndexOf('y') + 1;
  let formattedDateStr =
    dateStr.slice(yearStart, yearStop) + '-' +
    dateStr.slice(monthStart, monthStop) + '-' +
    dateStr.slice(dayStart, dayStop);
  dateTime = new Date(formattedDateStr);
  if (Number.isNaN(dateTime.getFullYear()) || Number.isNaN(dateTime.getMonth()) || Number.isNaN(dateTime.getDate())) {
    console.log(`ERROR: invalid date format: '${dateStr}'`);
    process.exit(1);
  }
  return dateTime;
}

// ---------- buffer manipulation
const addLineToBuffer = (buffer, newLine) => {
  // find first empty line in the buffer    
  let lineIdx = 0;
  while (lineIdx < buffer.length && buffer[lineIdx].task.length) {
    lineIdx++;
  }
  const res = lineIdx < buffer.length ? lineIdx : buffer.length;
  lineIdx >= buffer.length ? buffer.push(newLine) : buffer[lineIdx] = newLine;

  return res;
}

// ---------- line manipulation
const extractLine = (rawLine) => {
  const line = rawLine
    .trimStart()
    .trimEnd();
  const isPrio = line.charAt(0) == '*';
  let dueDate = null;
  let dueStart = line.indexOf('[');
  let dueEnd = -1;
  if (dueStart > -1) {
    dueEnd = line.indexOf(']', dueStart + 1);
  }
  if (dueStart > -1 && dueEnd > -1) {
    dueDate = parseDate(line.slice(dueStart + 1, dueEnd));
  }
  let taskStart = 0;
  if (dueEnd > -1) {
    taskStart = dueEnd + 1;
  } else if (isPrio) {
    taskStart = 2;
  }
  const task = line
    .slice(taskStart)
    .trimStart()
    .trimEnd();

  return {
    isPrio,
    dueDate,
    task,
  };
}
const compressLine = (line) => {
  let str = line.isPrio ? '* ' : '';
  if (line.dueDate) {
    str += '[' + formatDate(line.dueDate) + '] ';
  }
  str += line.task;
  return str;
}
const renderLine = (idx, line) => {
  let str = String(idx).padStart(2, ' ');
  str += String(line.isPrio ? '*' : '').padStart(2, ' ');
  str += String(line.dueDate ? formatDate(line.dueDate) : '').padStart(dateFormat.length + 1, ' ');
  str += ' ' + line.task;

  return str;
}

// ---------- command implementations
const addCommand = (args) => {
  const task = args[0];
  let dueDate = null;
  let isPrio = false;
  if (args.length > 1) {
    const cmd = parseCommand(args[1]);    
    if (!cmd) { // this must be a date
      dueDate = parseDate(args[1]);
      console.log(formatDate(dueDate));
    } else {
      if (cmd.name === 'prioritize') {
        isPrio = true;
      } else {
        console.log(`ERROR: invalid sub-command: '${args[1]}'`);
        process.exit(1);
      }
    }
  }

  const newLineIdx = addLineToBuffer(
    todoBuffer,
    {
      isPrio,
      dueDate,
      task,
    },
  );
  saveBuffer(todoTxt, todoBuffer);
  console.log(renderLine(newLineIdx, todoBuffer[newLineIdx]));
}

const listCommand = (args) => {
  console.log('ERROR: not yet implemented');
}

const COMMAND_MAP = [
  {
    name: 'add',
    aliases: ['add', 'a'],
    minParamCount: 1,
    maxParamCount: 2,
    callback: addCommand,
  },
  {
    name: 'prioritize',
    aliases: ['prioritize', 'priorize', 'prio', 'pri', 'p'],
    minParamCount: 1,
    maxParamCount: 2,
    callback: addCommand,
  },
  {
    name: 'list',
    aliases: ['list', 'ls', 'll', 'l'],
    minParamCount: 1,
    maxParamCount: 2,
    callback: listCommand,
  },
];
const WEEKDAY_MAP = [
  {
    name: 'Monday',
    aliases: [ 'monday', 'mon', 'mo' ],
    offset: 0,
  },
  {
    name: 'Tuesday',
    aliases: [ 'tuesday', 'tue', 'tu' ],
    offset: 1,
  },
  {
    name: 'Wednesday',
    aliases: [ 'wednesday', 'wed', 'we' ],
    offset: 2,
  },
  {
    name: 'Thursday',
    aliases: [ 'thursday', 'thu', 'th' ],
    offset: 3,
  },
  {
    name: 'Friday',
    aliases: [ 'friday', 'fri', 'fr' ],
    offset: 4,
  },
  {
    name: 'Saturday',
    aliases: [ 'saturday', 'sat', 'sa' ],
    offset: 5,
  },
  {
    name: 'Sunday',
    aliases: [ 'sunday', 'sun', 'su' ],
    offset: 6,
  },
];

// ---------- usage
const usage = () => {
  console.log('USAGE: dstodo.js -options [command] <command args...>');
}
// ---------- load config
const configFile = findConfig();
if (!configFile) {
  console.log('Error: cannot find config');
  process.exit(1);
}
const config = parseIni(loadFile(configFile));
const todoTxt = (config.get('TXT_DIR') || __dirname) + '/todo.txt';
const doneTxt = (config.get('TXT_DIR') || __dirname) + '/done.txt'; 
const dateFormat = config.get('DATE_FORMAT') || DEFAULT_DATE_FORMAT;

// --------- load buffers
if (fileExists(todoTxt)) {
  todoBuffer = loadBuffer(todoTxt);
}
if (fileExists(doneTxt)) {
  doneBuffer = loadBuffer(doneTxt);
}

// --------- argument parsing
if (process.argv.length < 3) {
  console.log('ERROR: not enough parameters!');
  usage();
  process.exit(1);
}

const commandArgIdx = 2; // when we have options it needs to be calculated
const command = parseCommand(process.argv[commandArgIdx]);
const commandParams = process.argv.slice(commandArgIdx + 1);
command.callback(commandParams);
