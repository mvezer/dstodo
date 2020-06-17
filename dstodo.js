#!/usr/bin/env node
const fs = require('fs');

// ----------- constants
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
const COLOR_MAP = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  underscore: '\x1b[4m',
  blink: '\x1b[5m',
  reverse: '\x1b[7m',
  hidden: '\x1b[8m',
  fg: {
    black: '\x1b[30m',
    red: '\x1b[31m',
    green: '\x1b[32m',
    yellow: '\x1b[33m',
    blue: '\x1b[34m',
    magenta: '\x1b[35m',
    cyan: '\x1b[36m',
    white: '\x1b[37m',
  },
  bg: {
    black: '\x1b[40m',
    red: '\x1b[41m',
    green: '\x1b[42m',
    yellow: '\x1b[43m',
    blue: '\x1b[44m',
    magenta: '\x1b[45m',
    cyan: '\x1b[46m',
    white: '\x1b[47m',
  },
};

// ---------- DEFAULTS
const HOME_DIR = require('os').homedir();
const COMMENT_CHR = '#';
const CONFIG_LOCATION = [
  HOME_DIR + '/.config/dstodo/config',
  HOME_DIR + '/.dstodo/config',
  HOME_DIR + '/.dstodo.cfg',
  __dirname + '/config'
];
const DEFAULT_PRIO_COLOR = COLOR_MAP.fg.magenta;
const DEFAULT_TODAY_COLOR = COLOR_MAP.fg.yellow;
const DEFAULT_OVERDUE_COLOR = COLOR_MAP.fg.red;
const DEFAULT_TOMORROW_COLOR = COLOR_MAP.fg.cyan;
const DEFAULT_WEEK_COLOR = COLOR_MAP.fg.blue;
const DEFAULT_DONE_COLOR = COLOR_MAP.fg.green;
const DEFAULT_DATE_FORMAT = 'dd-mm-yyy';

const DAY_TS = 24 * 60 * 60 * 1000; // one day in millisecs

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
  return loadFile(fName).map((line, idx) => extractLine(line, idx));
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
    const tomorrowTS = (new Date()).setDate(today.getDate() + 1);
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

    return new Date(new Date(targetDayTS));
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
const addLineToBuffer = (buffer, line) => {
  // find first empty line in the buffer    
  const emptyIdx = buffer.findIndex(line => !line.task);
  const newLine = line;
  if (emptyIdx > -1) {
    newLine.idx = emptyIdx;
    buffer[emptyIdx] = newLine;
  } else {
    newLine.idx = buffer.length;
    buffer.push(newLine);
  }

  return newLine;
}

const fetchLineFromBuffer = (buffer, idx) => {
  if (idx < 0 || idx >= buffer.length) {
    console.log(`ERROR: index (${idx}) cannot be found`);
    process.exit(1);
  }
  return buffer[idx];
}

const removeLineFromBuffer = (buffer, idx) => {
  const lineToRemove = fetchLineFromBuffer(buffer, idx);
  buffer[idx] = {
    isPrio: false,
    dueDate: null,
    task: '',
  };
  saveBuffer(todoTxt, todoBuffer);
  return lineToRemove;
}

// ---------- line manipulation
const extractLine = (rawLine, idx) => {
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
    idx,
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
const renderLine = (line, colorOverride) => {
  let color = null;
  const todayTS = parseInt((new Date()).getTime() / DAY_TS);
  if (colorOverride) {
    color = colorOverride;
  } else {
    if (line.isPrio) {
      color = prioColor;
    } else if (line.dueDate) {
      const dayDifference = parseInt(line.dueDate.getTime() / DAY_TS) - todayTS;
      if (dayDifference < 0) {
        color = overdueColor;
      } else if (dayDifference === 0) {
        color = todayColor;
      } else if (dayDifference === 1) {
        color = tomorrowColor;
      } else if (dayDifference < 7) {
        color = weekColor;
      }
    }
  }

  let str = '';
  if (color) {
    str += color;
  }
  str += String(line.idx).padStart(2, ' ');
  str += String(line.isPrio ? '*' : '').padStart(2, ' ');
  str += '[' + String(line.dueDate ? formatDate(line.dueDate) : '').padStart(dateFormat.length, ' ') + ']';
  str += ' ' + line.task;
  if (color) {
    str += COLOR_MAP.reset;
  }

  return str;
}

// ---------- sorting and filtering
const emptyLineFilter = (line) => {
  return !!(line.task.length);
}

const dueDateLineFilter = (filterDate, line) => {
  if (!filterDate) {
    return true;
  }
  return line.dueDate.getTime() == filterDate.getTime() || line.isPrio;
}

const dueDateLineSort = (a, b) => {
  if (a.dueDate && b.dueDate) {
    return a.dueDate.getTime() - b.dueDate.getTime(); 
  } else if (a.dueDate && !b.dueDate) {
    return -1;
  } else if (!a.dueDate && b.dueDate) {
    return 1;
  } else {
    return 0;
  }
}

const prioLineSort = (a, b) => {
  if (a.isPrio && !b.isPrio) {
    return -1;
  } else if (a.isPrio && b.isPrio) {
    return 0;
  } else {
    return 1;
  }
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
    } else {
      if (cmd.name === 'prioritize') {
        isPrio = true;
      } else {
        console.log(`ERROR: invalid sub-command: '${args[1]}'`);
        process.exit(1);
      }
    }
  }

  const newLine = addLineToBuffer(
    todoBuffer,
    {
      isPrio,
      dueDate,
      task,
    },
  );
  saveBuffer(todoTxt, todoBuffer);
  console.log(renderLine(newLine));
}

const listCommand = (args) => {
  const filterDate = args.length > 1 ? parseDate(args[1]) : null;
  const todoList = todoBuffer
    .filter(emptyLineFilter)
    .filter(dueDateLineFilter.bind(this, filterDate))
    .sort(dueDateLineSort)
    .sort(prioLineSort);

  const doneList = doneBuffer
    .filter(emptyLineFilter)
    .filter(dueDateLineFilter.bind(this, filterDate))
    .sort(dueDateLineSort)
    .sort(prioLineSort);
  
  if (todoList.length) {
    console.log('');
    console.log(`Todos (${todoList.length}):`);
    console.log('--------------------------------------------------');
    todoList
      .forEach((line) => { console.log(renderLine(line))});
    console.log('');
  }
  if (doneList.length) {
    console.log(`Done (${doneList.length}):`);
    console.log('--------------------------------------------------');
    doneList
      .forEach((line) => { console.log(renderLine(line, doneColor))});
    console.log('');
  }
  
}

const removeCommand = (args) => {
  const idx = args[0];
  const removedLine = removeLineFromBuffer(todoBuffer, idx);
  console.log(`The task: "${renderLine(removedLine)}" got deleted`);
}

const doneCommand = (args) => {
  const idx = args[0];
  const doneLine = fetchLineFromBuffer(todoBuffer, idx);
  removeLineFromBuffer(todoBuffer, idx);
  addLineToBuffer(doneBuffer, doneLine);
  saveBuffer(todoTxt, todoBuffer);
  saveBuffer(doneTxt, doneBuffer);
  console.log(`The task: "${renderLine(doneLine)}" is done! :)`);
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
    maxParamCount: 1,
    callback: addCommand,
  },
  {
    name: 'list',
    aliases: ['list', 'ls', 'll', 'l'],
    minParamCount: 0,
    maxParamCount: 1,
    callback: listCommand,
  },
  {
    name: 'remove',
    aliases: ['remove', 'rm', 'delete'],
    minParamCount: 1,
    maxParamCount: 1,
    callback: removeCommand,
  },
  {
    name: 'done',
    aliases: ['done', 'do'],
    minParamCount: 1,
    maxParamCount: 1,
    callback: doneCommand,
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

const overdueColor = config.get('OVERDUE_COLOR') || DEFAULT_OVERDUE_COLOR;
const todayColor = config.get('TODAY_COLOR') || DEFAULT_TODAY_COLOR;
const tomorrowColor = config.get('TOMORROW_COLOR') || DEFAULT_TOMORROW_COLOR;
const doneColor = config.get('DONE_COLOR') || DEFAULT_DONE_COLOR;
const weekColor = config.get('WEEK_COLOR') || DEFAULT_WEEK_COLOR;
const prioColor = config.get('PRIO_COLOR') || DEFAULT_PRIO_COLOR;

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
if (commandParams.length < command.minParamCount || commandParams.length > command.maxParamCount) {
  console.log(`ERROR: invalid parameter count for the "${command.name}" command`); 
  process.exit(1);
}
command.callback(commandParams);
