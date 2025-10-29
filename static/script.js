class CryptoAnalyzer {
    constructor() {
        this.initializeElements();
        this.bindEvents();
        this.initializeNumberInputs();
        this.currentData = [];
        this.sortState = {};
        this.isAnalyzing = false;

        this.initializeParticles();
        this.checkServerStatus();
    }

    initializeElements() {
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.retryBtn = document.getElementById('retryBtn');
        this.progressBar = document.getElementById('progressBar');
        this.progressFill = document.getElementById('progressFill');
        this.progressText = document.getElementById('progressText');
        this.resultsSection = document.getElementById('resultsSection');
        this.errorSection = document.getElementById('errorSection');
        this.resultsContainer = document.getElementById('resultsContainer');
        this.resultsCount = document.getElementById('resultsCount');
        this.resultsTime = document.getElementById('resultsTime');
        this.totalCryptos = document.getElementById('totalCryptos');
        this.filteredCryptos = document.getElementById('filteredCryptos');
        this.processingTime = document.getElementById('processingTime');
    }

    initializeParticles() {
        const container = document.getElementById('particles');
        const count = 50;

        for (let i = 0; i < count; i++) {
            const particle = document.createElement('div');
            particle.className = 'particle';
            particle.style.cssText = `
                position: absolute;
                width: ${Math.random() * 4 + 1}px;
                height: ${Math.random() * 4 + 1}px;
                background: rgba(255, 255, 255, ${Math.random() * 0.3});
                border-radius: 50%;
                left: ${Math.random() * 100}%;
                top: ${Math.random() * 100}%;
                animation: float ${Math.random() * 20 + 10}s linear infinite;
            `;
            container.appendChild(particle);
        }
    }

    initializeNumberInputs() {
        const numberInputs = ['minAthMarketCap', 'minCurrentMarketCap'];
        numberInputs.forEach(id => {
            const input = document.getElementById(id);
            input.addEventListener('blur', (e) => this.formatNumberInput(e.target));
            input.addEventListener('focus', (e) => this.unformatNumberInput(e.target));
            input.addEventListener('input', (e) => this.validateNumberInput(e.target));
            this.formatNumberInput(input);
        });
    }

    formatNumberInput(input) {
        const value = parseInt(input.getAttribute('data-value') || input.value.replace(/\s/g, ''));
        if (!isNaN(value)) {
            input.value = this.formatNumber(value);
            input.setAttribute('data-value', value);
        }
    }

    unformatNumberInput(input) {
        const value = input.getAttribute('data-value');
        if (value) {
            input.value = value;
        }
    }

    validateNumberInput(input) {
        const value = input.value.replace(/\s/g, '');
        if (!/^\d*$/.test(value)) {
            input.style.borderColor = 'var(--error-color)';
        } else {
            input.style.borderColor = 'var(--border-color)';
            input.setAttribute('data-value', value);
        }
    }

    formatNumber(value) {
        return new Intl.NumberFormat('ru-RU').format(value);
    }

    bindEvents() {
        this.analyzeBtn.addEventListener('click', () => this.analyze());
        this.resetBtn.addEventListener('click', () => this.resetFilters());
        this.retryBtn.addEventListener('click', () => this.hideError());

        document.querySelectorAll('.filter-group input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    this.analyze();
                }
            });
        });
    }

    async checkServerStatus() {
        try {
            const response = await fetch('/api/status');
            if (!response.ok) throw new Error('Сервер недоступен');
            console.log('✅ Сервер доступен');
        } catch (error) {
            console.warn('⚠️ Сервер недоступен:', error.message);
        }
    }

    getFilterParams() {
        return {
            min_ath_market_cap: parseInt(document.getElementById('minAthMarketCap').getAttribute('data-value') || document.getElementById('minAthMarketCap').value.replace(/\s/g, '')),
            min_current_market_cap: parseInt(document.getElementById('minCurrentMarketCap').getAttribute('data-value') || document.getElementById('minCurrentMarketCap').value.replace(/\s/g, '')),
            min_drawdown: parseFloat(document.getElementById('minDrawdown').value),
            max_drawdown: parseFloat(document.getElementById('maxDrawdown').value),
            max_results: parseInt(document.getElementById('maxResults').value)
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
        return true;
    }

    async analyze() {
        if (this.isAnalyzing) return;

        try {
            this.isAnalyzing = true;
            this.setLoadingState(true);
            this.hideError();
            this.hideResults();
            this.showProgress();

            const params = this.getFilterParams();
            this.validateFilters(params);

            this.updateProgress(10, 'Подготавливаем данные...');
            await this.delay(500);

            this.updateProgress(30, 'Загружаем информацию о криптовалютах...');
            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });

            this.updateProgress(70, 'Анализируем и фильтруем данные...');
            await this.delay(1000);

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Произошла ошибка при анализе');
            }

            this.updateProgress(90, 'Формируем результаты...');
            await this.delay(500);

            this.currentData = data.data;
            await this.displayResults(data);

            this.updateProgress(100, 'Анализ завершен!');
            await this.delay(1000);
            this.hideProgress();

        } catch (error) {
            this.showError(error.message);
            this.hideProgress();
        } finally {
            this.setLoadingState(false);
            this.isAnalyzing = false;
        }
    }

    setLoadingState(loading) {
        this.analyzeBtn.classList.toggle('loading', loading);
        this.analyzeBtn.disabled = loading;
    }

    showProgress() {
        this.progressBar.classList.remove('hidden');
    }

    hideProgress() {
        this.progressBar.classList.add('hidden');
    }

    updateProgress(percent, text) {
        this.progressFill.style.width = `${percent}%`;
        this.progressText.textContent = text;
    }

    async displayResults(data) {
        this.resultsCount.textContent = data.count;
        this.resultsTime.textContent = `${data.processing_time}с`;
        this.filteredCryptos.textContent = data.count;
        this.processingTime.textContent = `${data.processing_time}с`;

        this.generateTable(data.data);
        this.showResults();
        await this.animateTableRows();
        this.smoothScrollToResults();
    }

    generateTable(cryptos) {
        if (cryptos.length === 0) {
            this.resultsContainer.innerHTML = `
                <div class="no-results" style="text-align: center; padding: 60px; color: var(--text-muted);">
                    <i class="fas fa-search" style="font-size: 4rem; margin-bottom: 20px; opacity: 0.5;"></i>
                    <h3 style="margin-bottom: 15px;">Криптовалюты не найдены</h3>
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
                        <th data-sort="current_market_cap" class="number-cell">Текущая кап.</th>
                        <th data-sort="estimated_ath_market_cap" class="number-cell">ATH кап.</th>
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

        this.resultsContainer.innerHTML = tableHTML;
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

        const getChangeClass = (change) => {
            if (change === null || change === undefined) return 'neutral';
            return change > 0 ? 'price-up' : change < 0 ? 'price-down' : 'neutral';
        };

        const formatChange = (change) => {
            if (change === null || change === undefined) return 'N/A';
            return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        };

        const cmcUrl = `https://coinmarketcap.com/currencies/${crypto.id}/`;

        return `
            <tr class="table-row" style="opacity: 0; transform: translateY(20px);">
                <td class="number-cell">${index}</td>
                <td>
                    <a href="${cmcUrl}" target="_blank" class="crypto-link" title="Открыть на CoinMarketCap">
                        ${crypto.image ? `<img src="${crypto.image}" alt="${crypto.name}" class="crypto-icon" onerror="this.style.display='none'">` : ''}
                        <span>${crypto.name} (${crypto.symbol})</span>
                    </a>
                </td>
                <td class="number-cell"><strong>${formatPrice(crypto.ath_price)}</strong></td>
                <td class="number-cell"><strong>${formatPrice(crypto.current_price)}</strong></td>
                <td class="${getChangeClass(crypto.price_deviation)} number-cell">
                    <strong>${formatChange(crypto.price_deviation)}</strong>
                </td>
                <td class="number-cell">${formatCurrency(crypto.current_market_cap)}</td>
                <td class="number-cell"><strong>${formatCurrency(crypto.estimated_ath_market_cap)}</strong></td>
                <td class="negative number-cell"><strong>${crypto.drawdown_percent}%</strong></td>
                <td class="${getChangeClass(crypto.price_change_percentage_24h)} number-cell">
                    <strong>${formatChange(crypto.price_change_percentage_24h)}</strong>
                </td>
                <td class="neutral number-cell">${crypto.rank}</td>
            </tr>
        `;
    }

    addSortListeners() {
        const headers = this.resultsContainer.querySelectorAll('th[data-sort]');
        headers.forEach(header => {
            header.addEventListener('click', () => {
                const sortKey = header.getAttribute('data-sort');
                this.sortTable(sortKey, header);
            });
        });
    }

    sortTable(sortKey, header) {
        const headers = this.resultsContainer.querySelectorAll('th[data-sort]');
        headers.forEach(h => h.classList.remove('sort-asc', 'sort-desc'));

        const currentDirection = this.sortState[sortKey];
        const newDirection = currentDirection === 'asc' ? 'desc' : 'asc';

        this.currentData.sort((a, b) => {
            let aVal = a[sortKey];
            let bVal = b[sortKey];

            if (typeof aVal === 'string') {
                aVal = aVal.toLowerCase();
                bVal = bVal.toLowerCase();
                return newDirection === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
            }

            return newDirection === 'asc' ? aVal - bVal : bVal - aVal;
        });

        this.sortState[sortKey] = newDirection;
        header.classList.add(`sort-${newDirection}`);
        this.generateTable(this.currentData);
    }

    async animateTableRows() {
        const rows = this.resultsContainer.querySelectorAll('.table-row');
        for (let i = 0; i < rows.length; i++) {
            await this.delay(30);
            rows[i].style.opacity = '1';
            rows[i].style.transform = 'translateY(0)';
            rows[i].style.transition = 'all 0.4s ease';
        }
    }

    smoothScrollToResults() {
        if (this.resultsSection && !this.resultsSection.classList.contains('hidden')) {
            this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    resetFilters() {
        document.getElementById('minAthMarketCap').value = '500 000';
        document.getElementById('minAthMarketCap').setAttribute('data-value', '500000');

        document.getElementById('minCurrentMarketCap').value = '20 000';
        document.getElementById('minCurrentMarketCap').setAttribute('data-value', '20000');

        document.getElementById('minDrawdown').value = '50';
        document.getElementById('maxDrawdown').value = '90';
        document.getElementById('maxResults').value = '50';

        this.hideResults();
        this.hideError();
        this.currentData = [];
        this.sortState = {};
    }

    showResults() {
        this.resultsSection.classList.remove('hidden');
        this.resultsSection.classList.add('fade-in');
    }

    hideResults() {
        this.resultsSection.classList.add('hidden');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        this.errorSection.classList.remove('hidden');
        this.errorSection.classList.add('fade-in');
    }

    hideError() {
        this.errorSection.classList.add('hidden');
    }

    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new CryptoAnalyzer();
});