class CryptoAnalyzer {
    constructor() {
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.loadingElement = document.getElementById('loading');
        this.resultsElement = document.getElementById('results');
        this.errorElement = document.getElementById('error');
        this.resultsCountElement = document.getElementById('resultsCount');
        this.resultsTableElement = document.getElementById('resultsTable');

        this.isAnalyzing = false;
        this.currentData = [];
        this.sortState = {};

        this.bindEvents();
        this.initializeNumberInputs();
        this.checkServerStatus();
    }

    initializeNumberInputs() {
        // Форматирование числовых полей с разделителями
        const numberInputs = ['minAthMarketCap', 'minCurrentMarketCap'];
        numberInputs.forEach(id => {
            const input = document.getElementById(id);
            input.addEventListener('blur', (e) => this.formatNumberInput(e.target));
            input.addEventListener('focus', (e) => this.unformatNumberInput(e.target));
            input.addEventListener('input', (e) => this.handleNumberInput(e.target));
            this.formatNumberInput(input);
        });
    }

    handleNumberInput(input) {
        // Сохраняем числовое значение в data-атрибут
        const numericValue = input.value.replace(/,/g, '');
        if (!isNaN(numericValue) && numericValue !== '') {
            input.setAttribute('data-value', numericValue);
        }
    }

    formatNumberInput(input) {
        const value = input.getAttribute('data-value') || input.value.replace(/,/g, '');
        if (value && !isNaN(value)) {
            input.value = this.formatCurrency(parseFloat(value));
            input.setAttribute('data-value', value);
        }
    }

    unformatNumberInput(input) {
        const value = input.getAttribute('data-value');
        if (value) {
            input.value = value;
        }
    }

    formatCurrency(value) {
        return new Intl.NumberFormat('en-US').format(value);
    }

    bindEvents() {
        this.analyzeBtn.addEventListener('click', () => this.analyze());
        this.resetBtn.addEventListener('click', () => this.resetFilters());

        // Enter key support for inputs
        document.querySelectorAll('.filter-group input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.analyze();
                }
            });

            // Real-time validation
            input.addEventListener('input', () => this.validateInput(input));
        });
    }

    validateInput(input) {
        const value = parseFloat(input.value);
        const min = parseFloat(input.min);
        const max = parseFloat(input.max);

        if (input.value === '') {
            input.style.borderColor = 'var(--border-color)';
            return;
        }

        if (isNaN(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
            input.style.borderColor = 'var(--error-color)';
        } else {
            input.style.borderColor = 'var(--success-color)';
        }
    }

    getFilterParams() {
        // Получаем значения из форматированных полей
        const minAthMarketCap = document.getElementById('minAthMarketCap').getAttribute('data-value') ||
                               document.getElementById('minAthMarketCap').value.replace(/,/g, '');

        const minCurrentMarketCap = document.getElementById('minCurrentMarketCap').getAttribute('data-value') ||
                                   document.getElementById('minCurrentMarketCap').value.replace(/,/g, '');

        return {
            min_ath_market_cap: parseFloat(minAthMarketCap) || 500000,
            min_current_market_cap: parseFloat(minCurrentMarketCap) || 20000,
            min_drawdown: parseFloat(document.getElementById('minDrawdown').value) || 50,
            max_drawdown: parseFloat(document.getElementById('maxDrawdown').value) || 90,
            max_results: parseInt(document.getElementById('maxResults').value) || 50
        };
    }

    validateFilters(params) {
        if (params.min_drawdown >= params.max_drawdown) {
            throw new Error('Минимальная просадка должна быть меньше максимальной');
        }

        if (params.min_ath_market_cap < 0 || params.min_current_market_cap < 0) {
            throw new Error('Капитализация не может быть отрицательной');
        }

        if (params.max_results < 1 || params.max_results > 200) {
            throw new Error('Количество результатов должно быть от 1 до 200');
        }

        if (params.min_drawdown < 0 || params.max_drawdown < 0) {
            throw new Error('Просадка указывается в положительных значениях');
        }

        return true;
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/status');
            if (!response.ok) {
                throw new Error('Сервер недоступен');
            }
            console.log('✅ Сервер доступен');
        } catch (error) {
            console.warn('⚠️ Сервер недоступен:', error.message);
        }
    }

    async analyze() {
        if (this.isAnalyzing) return;

        try {
            this.isAnalyzing = true;
            this.analyzeBtn.disabled = true;
            this.analyzeBtn.innerHTML = '<span class="btn-icon">⏳</span><span>Анализ...</span>';

            this.hideError();
            this.hideResults();
            this.showLoading();

            const params = this.getFilterParams();
            this.validateFilters(params);

            console.log('Параметры фильтрации:', params);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(params)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Произошла ошибка при анализе');
            }

            this.currentData = data.data;
            await this.displayResults(data);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.isAnalyzing = false;
            this.analyzeBtn.disabled = false;
            this.analyzeBtn.innerHTML = '<span class="btn-icon">🔍</span><span>Анализировать криптовалюты</span>';
            this.hideLoading();
        }
    }

    async displayResults(data) {
        this.resultsCountElement.innerHTML = `
            <span class="card-icon">🎯</span>
            Найдено криптовалют: <span class="gradient-text">${data.count}</span>
            ${data.processing_time ? `<span style="margin-left: 15px; color: var(--text-muted); font-size: 0.9em;">(время обработки: ${data.processing_time}с)</span>` : ''}
        `;

        this.generateTable(data.data);
        this.showResults();

        // Добавляем анимацию для строк таблицы
        await this.animateTableRows();

        // Плавная прокрутка к результатам
        this.smoothScrollToResults();
    }

    generateTable(cryptos) {
        if (cryptos.length === 0) {
            this.resultsTableElement.innerHTML = `
                <div class="no-results">
                    <div style="font-size: 3rem; margin-bottom: 20px;">🎯</div>
                    <h3>Криптовалюты не найдены</h3>
                    <p>Попробуйте изменить параметры фильтрации для получения результатов</p>
                </div>
            `;
            return;
        }

        const tableHTML = `
            <table class="crypto-table">
                <thead>
                    <tr>
                        <th data-sort="rank">#</th>
                        <th data-sort="name">Криптовалюта</th>
                        <th data-sort="ath_price" class="number-cell">Макс. цена ($)</th>
                        <th data-sort="current_price" class="number-cell">Цена ($)</th>
                        <th data-sort="price_deviation" class="number-cell">Отклонение</th>
                        <th data-sort="current_market_cap" class="number-cell">Текущая кап. ($)</th>
                        <th data-sort="estimated_ath_market_cap" class="number-cell">ATH кап. ($)</th>
                        <th data-sort="drawdown_positive" class="number-cell">Просадка</th>
                        <th data-sort="price_change_percentage_24h" class="number-cell">24ч</th>
                        <th data-sort="rank" class="number-cell">Ранг</th>
                    </tr>
                </thead>
                <tbody>
                    ${cryptos.map((crypto, index) => this.generateTableRow(crypto, index + 1)).join('')}
                </tbody>
            </table>
        `;

        this.resultsTableElement.innerHTML = tableHTML;

        // Добавляем обработчики сортировки
        this.addSortListeners();
    }

    generateTableRow(crypto, index) {
        const formatCurrency = (value) => {
            if (value >= 1e9) return `$${(value / 1e9).toFixed(2)}B`;
            if (value >= 1e6) return `$${(value / 1e6).toFixed(2)}M`;
            if (value >= 1e3) return `$${(value / 1e3).toFixed(2)}K`;
            return `$${value.toFixed(2)}`;
        };

        const formatPrice = (price) => {
            if (price >= 1) return `$${price.toFixed(2)}`;
            if (price >= 0.01) return `$${price.toFixed(4)}`;
            return `$${price.toFixed(6)}`;
        };

        const get24hChangeClass = (change) => {
            if (change === null || change === undefined) return 'neutral';
            return change > 0 ? 'price-up' : change < 0 ? 'price-down' : 'neutral';
        };

        const format24hChange = (change) => {
            if (change === null || change === undefined) return 'N/A';
            return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        };

        // Генерируем ссылку на CoinMarketCap
        const cmcUrl = `https://coinmarketcap.com/currencies/${crypto.id}/`;

        return `
            <tr class="table-row">
                <td class="number-cell">${index}</td>
                <td>
                    <a href="${cmcUrl}" target="_blank" class="crypto-link" title="Открыть на CoinMarketCap">
                        ${crypto.image ? `<img src="${crypto.image}" alt="${crypto.name}" class="crypto-icon" onerror="this.style.display='none'">` : ''}
                        <span>${crypto.name} (${crypto.symbol})</span>
                    </a>
                </td>
                <td class="number-cell"><strong>${formatPrice(crypto.ath_price)}</strong></td>
                <td class="number-cell"><strong>${formatPrice(crypto.current_price)}</strong></td>
                <td class="negative number-cell"><strong>${crypto.price_deviation}%</strong></td>
                <td class="number-cell">${formatCurrency(crypto.current_market_cap)}</td>
                <td class="number-cell"><strong>${formatCurrency(crypto.estimated_ath_market_cap)}</strong></td>
                <td class="negative number-cell"><strong>${crypto.drawdown_percent}%</strong></td>
                <td class="${get24hChangeClass(crypto.price_change_percentage_24h)} number-cell">
                    <strong>${format24hChange(crypto.price_change_percentage_24h)}</strong>
                </td>
                <td class="neutral number-cell">${crypto.rank}</td>
            </tr>
        `;
    }

    addSortListeners() {
        const headers = this.resultsTableElement.querySelectorAll('th[data-sort]');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.getAttribute('data-sort');
                this.sortTable(sortKey, header);
            });
        });
    }

    sortTable(sortKey, header) {
        if (this.currentData.length === 0) return;

        // Сбрасываем сортировку для всех заголовков
        const headers = this.resultsTableElement.querySelectorAll('th[data-sort]');
        headers.forEach(h => {
            h.classList.remove('sort-asc', 'sort-desc');
        });

        // Определяем направление сортировки
        let sortDirection = 'asc';
        if (this.sortState[sortKey] === 'asc') {
            sortDirection = 'desc';
        }

        // Сортируем данные
        const sortedData = [...this.currentData].sort((a, b) => {
            let aValue = a[sortKey];
            let bValue = b[sortKey];

            // Для строк - обычное сравнение
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
                return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
            }

            // Для чисел - числовое сравнение
            return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
        });

        // Обновляем состояние сортировки
        this.sortState[sortKey] = sortDirection;
        header.classList.add(`sort-${sortDirection}`);

        // Перерисовываем таблицу с отсортированными данными
        this.resultsTableElement.querySelector('tbody').innerHTML =
            sortedData.map((crypto, index) => this.generateTableRow(crypto, index + 1)).join('');
    }

    async animateTableRows() {
        const rows = this.resultsTableElement.querySelectorAll('.table-row');
        for (let i = 0; i < rows.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 30));
            rows[i].style.opacity = '1';
            rows[i].style.transform = 'translateX(0)';
            rows[i].style.transition = 'all 0.3s ease';
        }
    }

    smoothScrollToResults() {
        if (this.resultsElement && !this.resultsElement.classList.contains('hidden')) {
            this.resultsElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

    resetFilters() {
        document.getElementById('minAthMarketCap').value = '500,000';
        document.getElementById('minAthMarketCap').setAttribute('data-value', '500000');

        document.getElementById('minCurrentMarketCap').value = '20,000';
        document.getElementById('minCurrentMarketCap').setAttribute('data-value', '20000');

        document.getElementById('minDrawdown').value = '50';
        document.getElementById('maxDrawdown').value = '90';
        document.getElementById('maxResults').value = '50';

        // Сбрасываем стили валидации
        document.querySelectorAll('.filter-group input').forEach(input => {
            input.style.borderColor = 'var(--border-color)';
        });

        this.hideResults();
        this.hideError();
        this.currentData = [];
        this.sortState = {};
    }

    showLoading() {
        this.loadingElement.classList.remove('hidden');
    }

    hideLoading() {
        this.loadingElement.classList.add('hidden');
    }

    showResults() {
        this.resultsElement.classList.remove('hidden');
        this.resultsElement.classList.add('fade-in');
    }

    hideResults() {
        this.resultsElement.classList.add('hidden');
        this.resultsElement.classList.remove('fade-in');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        this.errorElement.classList.remove('hidden');
        this.errorElement.classList.add('fade-in');
    }

    hideError() {
        this.errorElement.classList.add('hidden');
        this.errorElement.classList.remove('fade-in');
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new CryptoAnalyzer();

    // Глобальная функция для обработки ошибок изображений
    window.handleImageError = function(img) {
        img.style.display = 'none';
    };
});