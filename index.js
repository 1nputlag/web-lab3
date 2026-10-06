import { Command } from 'commander';
import fs from 'node:fs/promises';
import path from 'node:path';

const program = new Command();

// Налаштування метаданих програми
program
  .name('schedule-cli')
  .description('CLI-програма для роботи з розкладом навчальних занять')
  .version('1.0.0');

// Глобальна опція для вибору JSON-файлу (працює з будь-якою командою)
program.option(
  '-f, --file <path>',
  'шлях до вхідного JSON-файлу з розкладом',
  'schedule.json'
);

// Функція для безпечного читання JSON-файлу з обробкою помилок
async function loadData() {
  const options = program.opts();
  const filePath = path.resolve(options.file);

  try {
    const rawContent = await fs.readFile(filePath, 'utf-8');
    return JSON.parse(rawContent);
  } catch (error) {
    if (error.code === 'ENOENT') {
      console.error(`Помилка: Файл за шляхом "${filePath}" не знайдено.`);
    } else if (error instanceof SyntaxError) {
      console.error(`Помилка: Файл "${filePath}" містить некоректний синтаксис JSON.`);
    } else {
      console.error(`Помилка під час читання файла: ${error.message}`);
    }
    process.exit(1); // Ненульовий код завершення
  }
}

// Допоміжна функція для отримання масиву занять з об'єкта
function getClasses(data) {
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.classes)) return data.classes;
  console.error('Помилка: У JSON-файлі відсутній масив занять "classes".');
  process.exit(1);
}

// Допоміжна функція для роботи з вкладеними полями (наприклад: teacher.lastName)
function getNestedValue(obj, pathString) {
  const keys = pathString.split('.');
  let current = obj;

  for (const key of keys) {
    if (current === null || current === undefined || !(key in current)) {
      return undefined;
    }
    current = current[key];
  }
  return current;
}

// ЧАСТИНА 3. Загальні можливості (усі варіанти)
// 1. Команда 'list' - стислий список елементів з можливістю обмеження
program
  .command('list')
  .description('Показати стислий перелік занять з розкладу')
  .option('-l, --limit <number>', 'обмежити кількість відображених занять', parseInt)
  .action(async (options) => {
    const data = await loadData();
    const classes = getClasses(data);

    if (options.limit !== undefined && (isNaN(options.limit) || options.limit <= 0)) {
      console.error('Помилка: Значення опції --limit має бути додатним числом.');
      process.exit(1);
    }

    let result = classes;
    if (options.limit) {
      result = classes.slice(0, options.limit);
    }

    console.log(`Група: ${data.groupName || 'Н/Д'}, Семестр: ${data.semester || 'Н/Д'}`);
    console.log(`--- Перелік занять (всього: ${classes.length}, показано: ${result.length}) ---`);

    result.forEach((cls, index) => {
      const subjectName = cls.subject?.name || 'Без назви';
      const type = cls.subject?.type ? `(${cls.subject.type})` : '';
      const day = cls.dayOfWeek || 'Н/Д';
      const pair = cls.pairNumber ? `пара №${cls.pairNumber}` : '';
      console.log(`[#${index + 1}] ${day}, ${pair}: ${subjectName} ${type}`);
    });
  });

// 2. Команда 'get' - вивід одного елемента за порядковим номером (починаючи з 1)
program
  .command('get <index>')
  .description('Показати повну інформацію про один елемент розкладу за його порядковим номером (1, 2...)')
  .action(async (indexStr) => {
    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index <= 0) {
      console.error('Помилка: Номер елемента має бути додатним цілим числом.');
      process.exit(1);
    }

    const data = await loadData();
    const classes = getClasses(data);

    if (index > classes.length) {
      console.error(`Помилка: Заняття з номером ${index} не знайдено (усього занять: ${classes.length}).`);
      process.exit(1);
    }

    const item = classes[index - 1];
    console.log(`--- Інформація про заняття #${index} ---`);
    console.log(JSON.stringify(item, null, 2));
  });

// 3. Команда 'field' - вивід значення окремого (зокрема вкладеного) поля
program
  .command('field <index> <fieldPath>')
  .description('Показати значення окремого поля для заняття (наприклад: 1 teacher.lastName або 2 location)')
  .action(async (indexStr, fieldPath) => {
    const index = parseInt(indexStr, 10);
    if (isNaN(index) || index <= 0) {
      console.error('Помилка: Номер елемента має бути додатним цілим числом.');
      process.exit(1);
    }

    const data = await loadData();
    const classes = getClasses(data);

    if (index > classes.length) {
      console.error(`Помилка: Заняття з номером ${index} не знайдено.`);
      process.exit(1);
    }

    const item = classes[index - 1];
    const value = getNestedValue(item, fieldPath);

    if (value === undefined) {
      console.error(`Помилка: Поле "${fieldPath}" відсутнє у занятті #${index}.`);
      process.exit(1);
    }

    if (value === null) {
      console.log(`Значення поля "${fieldPath}" для заняття #${index}: null (значення явно відсутнє).`);
    } else if (typeof value === 'object') {
      console.log(`Значення поля "${fieldPath}" для заняття #${index}:\n${JSON.stringify(value, null, 2)}`);
    } else {
      console.log(`Значення поля "${fieldPath}" для заняття #${index}: ${value}`);
    }
  });

// ЧАСТИНА 4. Можливості Варіанта 1 (Розклад занять)
// Можливість 1: Заняття за обраний день тижня
program
  .command('day <dayOfWeek>')
  .description('Показати всі заняття для обраного дня тижня (наприклад: Monday, Tuesday)')
  .action(async (dayOfWeek) => {
    const data = await loadData();
    const classes = getClasses(data);

    const filtered = classes.filter(
      (cls) => cls.dayOfWeek && cls.dayOfWeek.toLowerCase() === dayOfWeek.toLowerCase()
    );

    if (filtered.length === 0) {
      console.log(`Заняття на день "${dayOfWeek}" відсутні.`);
      return;
    }

    console.log(`--- Заняття на день: ${dayOfWeek} (знайдено: ${filtered.length}) ---`);
    console.log(JSON.stringify(filtered, null, 2));
  });

// Можливість 2: Заняття певного викладача з можливістю відбору лише дистанційних
program
  .command('teacher <lastName>')
  .description('Показати розклад конкретного викладача за прізвищем')
  .option('-r, --remote-only', 'відобразити лише дистанційні заняття')
  .action(async (lastName, options) => {
    const data = await loadData();
    const classes = getClasses(data);

    let filtered = classes.filter((cls) => {
      const teacherLastName = cls.teacher?.lastName || '';
      return teacherLastName.toLowerCase().includes(lastName.toLowerCase());
    });

    if (options.remoteOnly) {
      filtered = filtered.filter((cls) => cls.isRemote === true);
    }

    if (filtered.length === 0) {
      console.log(`Заняття для викладача "${lastName}" не знайдено.`);
      return;
    }

    console.log(`--- Заняття викладача "${lastName}" (знайдено: ${filtered.length}) ---`);
    console.log(JSON.stringify(filtered, null, 2));
  });

// Можливість 3: Розклад для чисельника/знаменника з урахуванням щотижневих занять
program
  .command('week <type>')
  .description('Показати розклад для чисельника (numerator) чи знаменника (denominator)')
  .action(async (type) => {
    const normalizedType = type.toLowerCase();
    const validTypes = ['numerator', 'denominator', 'чисельник', 'знаменник'];

    if (!validTypes.includes(normalizedType)) {
      console.error('Помилка: Тип тижня має бути "numerator", "denominator" (або "чисельник", "знаменник").');
      process.exit(1);
    }

    const targetType = (normalizedType === 'чисельник') ? 'numerator' : (normalizedType === 'знаменник') ? 'denominator' : normalizedType;

    const data = await loadData();
    const classes = getClasses(data);

    // Пари, де weekType дорівнює потрібному АБО є null (щотижневі заняття)
    const filtered = classes.filter(
      (cls) => cls.weekType === null || cls.weekType.toLowerCase() === targetType
    );

    console.log(`--- Розклад для тижня: ${targetType} (включно з щотижневими заняттями) ---`);
    console.log(JSON.stringify(filtered, null, 2));
  });

// Обробка аргументів командного рядка
program.parse(process.argv);