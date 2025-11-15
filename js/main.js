// main.js — только интерфейсные функции (без логики магазина)

// Инициализация
document.addEventListener('DOMContentLoaded', () => {
    setupSmoothScrolling();
});

// Плавная прокрутка
function setupSmoothScrolling() {
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', e => {
            // Не трогаем ссылки, управляющие категориями или JS-кнопками
            if (anchor.hasAttribute('data-category')) return;

            e.preventDefault();
            const target = document.querySelector(anchor.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });
}
