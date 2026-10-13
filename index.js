import { Command } from 'commander';   // пакет commander: розбір аргументів командного рядка
import fs from 'node:fs/promises';     // вбудований модуль для роботи з файлами (асинхронний)
import path from 'node:path';          // вбудований модуль для роботи зі шляхами

const program = new Command();   // головний об'єкт програми

program
  .name('schedule-cli')   // назва програми (показується в довідці)
  .description('CLI-програма для роботи з розкладом навчальних занять')   // опис програми
  .version('1.0.0', '-V, --version', 'показати версію програми')   // версія; прапорець і опис українською
  .helpOption('-h, --help', 'показати довідку')   // прапорець довідки з українським описом
  .helpCommand('help [command]', 'показати довідку для команди');   // команда help з українським описом

program.option(
  '-f, --file <path>',                       // глобальна опція зі значенням: працює з будь-якою командою
  'шлях до вхідного JSON-файлу з розкладом', // опис опції
  'schedule.json'                            // значення за замовчуванням
);

function fail(message) {   // вивести помилку і завершити програму
  console.error(`Помилка: ${message}`);   // повідомлення українською в потік помилок
  process.exit(1);   // код 1 = невдале завершення (без стеку викликів)
}

async function loadData() {   // прочитати JSON-файл і повернути його як об'єкт
  const filePath = path.resolve(program.opts().file);   // шлях з опції --file перетворюємо на абсолютний

  let text;   // сюди запишемо вміст файлу
  try {
    text = await fs.readFile(filePath, 'utf-8');   // читаємо файл як текст і чекаємо результату
  } catch (error) {
    if (error.code === 'ENOENT') {   // ENOENT = файл не існує
      fail(`Файл за шляхом "${filePath}" не знайдено.`);
    }
    fail(`Не вдалося прочитати файл "${filePath}": ${error.message}`);   // будь-яка інша помилка читання
  }

  try {
    return JSON.parse(text);   // перетворюємо текст на об'єкт
  } catch (error) {
    fail(`Файл "${filePath}" містить некоректний синтаксис JSON.`);   // JSON.parse кинув помилку: хибний синтаксис
  }
}

function getClasses(data) {   // дістати масив занять з даних
  if (data && Array.isArray(data.classes)) {   // у даних має бути масив classes
    return data.classes;
  }
  fail('У JSON-файлі відсутній масив занять "classes".');
}

function parsePositiveInt(text) {   // рядок -> додатне ціле число, або null, якщо рядок некоректний
  if (!/^\d+$/.test(text)) {   // має складатися лише з цифр ("abc", "1.5", "1abc", "-2" не проходять)
    return null;
  }
  const number = Number(text);   // перетворюємо рядок на число
  if (number === 0) {   // нуль не підходить: нумерація з 1
    return null;
  }
  return number;
}

function getClassByNumber(classes, numberText) {   // взяти заняття за номером (нумерація з 1)
  const number = parsePositiveInt(numberText);   // перевіряємо, що це додатне ціле
  if (number === null) {
    fail('Номер заняття має бути додатним цілим числом.');
  }
  if (number > classes.length) {   // номер більший за кількість занять
    fail(`Заняття з номером ${number} не знайдено (усього занять: ${classes.length}).`);
  }
  return classes[number - 1];   // у масиві нумерація з 0, тому віднімаємо 1
}

function getNestedValue(item, fieldPath) {   // дістати поле за шляхом через крапку (teacher.lastName)
  let current = item;   // починаємо з самого заняття

  for (const key of fieldPath.split('.')) {   // "teacher.lastName" -> ["teacher", "lastName"]
    if (current === null || typeof current !== 'object') {   // углиб можна йти лише в об'єкт
      return undefined;
    }
    if (!Object.hasOwn(current, key)) {   // чи є такий ключ у самому об'єкті
      return undefined;   // undefined = поля немає (а значення null означає "поле є, але порожнє")
    }
    current = current[key];   // переходимо на крок углиб
  }

  return current;
}

function normalizeWeekType(text) {   // привести тип тижня до numerator / denominator
  const value = text.toLowerCase();   // регістр не важливий

  if (value === 'numerator' || value === 'чисельник') {
    return 'numerator';
  }
  if (value === 'denominator' || value === 'знаменник') {
    return 'denominator';
  }
  return null;   // некоректне значення
}

program
  .command('list')   // команда list
  .description('Показати стислий перелік занять з розкладу')   // опис команди
  .option('-l, --limit <number>', 'обмежити кількість відображених занять')   // опція зі значенням
  .action(async (options) => {   // що виконується при запуску команди
    let limit = null;   // null = без обмеження
    if (options.limit !== undefined) {   // користувач вказав --limit
      limit = parsePositiveInt(options.limit);   // перевіряємо значення до читання файлу
      if (limit === null) {
        fail('Значення опції --limit має бути додатним числом.');
      }
    }

    const data = await loadData();   // читаємо файл
    const classes = getClasses(data);   // беремо масив занять

    let shown = classes;   // за замовчуванням показуємо всі заняття
    if (limit !== null) {
      shown = classes.slice(0, limit);   // або перші N
    }

    console.log(`Група: ${data.groupName}, Семестр: ${data.semester}`);   // заголовок з метаданими
    console.log(`--- Перелік занять (всього: ${classes.length}, показано: ${shown.length}) ---`);

    shown.forEach((item, i) => {   // один рядок на заняття; i — індекс з 0
      console.log(`[#${i + 1}] ${item.dayOfWeek}, пара №${item.pairNumber}: ${item.subject.name} (${item.subject.type})`);
    });
  });

program
  .command('get <index>')   // обов'язковий аргумент index (кутові дужки)
  .description('Показати повну інформацію про одне заняття за його порядковим номером (1, 2...)')
  .action(async (index) => {
    const data = await loadData();
    const item = getClassByNumber(getClasses(data), index);   // заняття за номером (з перевірками)

    console.log(`--- Інформація про заняття #${index} ---`);
    console.log(JSON.stringify(item, null, 2));   // гарний JSON з відступами у 2 пробіли
  });

program
  .command('field <index> <fieldPath>')   // два обов'язкові аргументи: номер і шлях до поля
  .description('Показати значення поля заняття (наприклад: 1 teacher.lastName або 2 location)')
  .action(async (index, fieldPath) => {
    const data = await loadData();
    const item = getClassByNumber(getClasses(data), index);
    const value = getNestedValue(item, fieldPath);   // значення поля або undefined
    const title = `Значення поля "${fieldPath}" для заняття #${index}`;   // початок повідомлення

    if (value === undefined) {   // поля немає взагалі: помилка
      fail(`Поле "${fieldPath}" відсутнє у занятті #${index}.`);
    } else if (value === null) {   // поле є, але дорівнює null: нормальний результат
      console.log(`${title}: null (значення явно відсутнє).`);
    } else if (typeof value === 'object') {   // вкладений об'єкт показуємо як JSON
      console.log(`${title}:\n${JSON.stringify(value, null, 2)}`);
    } else {   // рядок, число або boolean
      console.log(`${title}: ${value}`);
    }
  });

program
  .command('day <dayOfWeek>')   // обов'язковий аргумент: день тижня
  .description('Показати всі заняття для обраного дня тижня (наприклад: Monday, Tuesday)')
  .action(async (dayOfWeek) => {
    const data = await loadData();
    const classes = getClasses(data);

    const found = classes.filter((item) => {   // залишаємо заняття потрібного дня
      return item.dayOfWeek.toLowerCase() === dayOfWeek.toLowerCase();   // без урахування регістру
    });

    if (found.length === 0) {   // нічого не знайдено: це не помилка, код завершення 0
      console.log(`Заняття на день "${dayOfWeek}" відсутні.`);
      return;
    }

    console.log(`--- Заняття на день: ${dayOfWeek} (знайдено: ${found.length}) ---`);
    console.log(JSON.stringify(found, null, 2));
  });

program
  .command('teacher <lastName>')   // обов'язковий аргумент: прізвище
  .description('Показати розклад викладача за прізвищем (або його частиною)')
  .option('-r, --remote-only', 'показати лише дистанційні заняття')   // прапорець без значення
  .action(async (lastName, options) => {
    const data = await loadData();
    const classes = getClasses(data);

    let found = classes.filter((item) => {   // відбір за прізвищем
      return item.teacher.lastName.toLowerCase().includes(lastName.toLowerCase());   // збіг за частиною, без регістру
    });

    if (options.remoteOnly) {   // прапорець -r: commander перетворив --remote-only на remoteOnly
      found = found.filter((item) => item.isRemote === true);   // лишаємо лише дистанційні
    }

    if (found.length === 0) {   // нічого не знайдено: код завершення 0
      console.log(`Заняття для викладача "${lastName}" не знайдено.`);
      return;
    }

    console.log(`--- Заняття викладача "${lastName}" (знайдено: ${found.length}) ---`);
    console.log(JSON.stringify(found, null, 2));
  });

program
  .command('week <type>')   // обов'язковий аргумент: тип тижня
  .description('Показати розклад для чисельника (numerator) чи знаменника (denominator)')
  .action(async (type) => {
    const weekType = normalizeWeekType(type);   // numerator, denominator або null
    if (weekType === null) {
      fail('Тип тижня має бути "numerator", "denominator" (або "чисельник", "знаменник").');
    }

    const data = await loadData();
    const classes = getClasses(data);

    const found = classes.filter((item) => {   // беремо заняття потрібного типу тижня
      return item.weekType === null || item.weekType === weekType;   // null = заняття щотижня, беремо завжди
    });

    console.log(`--- Розклад для тижня: ${weekType} (включно з щотижневими заняттями) ---`);
    console.log(JSON.stringify(found, null, 2));
  });

program.parse(process.argv);   // запустити розбір командного рядка (завжди останній рядок)