document.addEventListener('DOMContentLoaded', () => {
    const goToCatalogBtn = document.getElementById('goToCatalogBtn');
    if (goToCatalogBtn) {
        goToCatalogBtn.addEventListener('click', () => {
            const catalog = document.getElementById('catalog');
            if (catalog) catalog.scrollIntoView({ behavior: 'smooth' });
        });
    }
});
