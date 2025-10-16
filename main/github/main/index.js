function formatDate(date) {
  return date.toISOString().split('T')[0];
}

// Получаем текущий год как число
const currentYear = new Date().getFullYear();

// Обновляем элементы
document.getElementById('time').innerHTML = `🕒 Updated: ${formatDate(new Date())}`;
document.getElementById('OS').innerHTML = `💻 OS: ${getOS()}`; // Используем функцию для получения ОС
document.getElementById('year').innerHTML = `<b>${currentYear}</b>`;

// Функция для определения операционной системы
