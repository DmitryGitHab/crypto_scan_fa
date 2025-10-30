class CryptoAnalyzer {
    constructor() {
        this.analyzeBtn = document.getElementById('analyzeBtn');
        this.resetBtn = document.getElementById('resetBtn');
        this.progressSection = document.getElementById('progressSection');
        this.resultsSection = document.getElementById('resultsSection');
        this.errorSection = document.getElementById('errorSection');
        this.resultsCount = document.getElementById('resultsCount');
        this.resultsTable = document.getElementById('resultsTable');

        this.isAnalyzing = false;
        this.currentData = [];
        this.sortState = {};
        this.analysisTimer = null;
        this.startTime = null;

        this.bindEvents();
        this.initializeNumberInputs();
        this.startStatusMonitoring();
    }

    initializeNumberInputs() {
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
        let value = input.value.replace(/[^\d]/g, '');
        input.setAttribute('data-value', value);
    }

    formatNumberInput(input) {
        const value = input.getAttribute('data-value') || input.value.replace(/\s/g, '').replace(/[^\d]/g, '');
        if (value) {
            const numberValue = parseInt(value);
            if (!isNaN(numberValue)) {
                input.value = this.formatNumber(numberValue);
                input.setAttribute('data-value', numberValue);
            }
        }
    }

    unformatNumberInput(input) {
        const value = input.getAttribute('data-value');
        if (value) {
            input.value = value;
        }
    }

    formatNumber(value) {
        return new Intl.NumberFormat('ru-RU').format(value);
    }

    bindEvents() {
        this.analyzeBtn.addEventListener('click', () => this.analyze());
        this.resetBtn.addEventListener('click', () => this.resetFilters());

        document.querySelectorAll('.filter-group input').forEach(input => {
            input.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.analyze();
            });
        });
    }

    startStatusMonitoring() {
        setInterval(() => this.updateServerStatus(), 10000);
        this.updateServerStatus();
    }

    async updateServerStatus() {
        try {
            const start = performance.now();
            const response = await fetch('/api/status');
            const end = performance.now();

            if (response.ok) {
                const data = await response.json();
                document.getElementById('serverStatus').textContent = 'Online';
                document.getElementById('responseTime').textContent = `${Math.round(end - start)}ms`;
                document.getElementById('dataCount').textContent = `${data.requests_count || 0} requests`;
            }
        } catch (error) {
            document.getElementById('serverStatus').textContent = 'Offline';
        }
    }

    getFilterParams() {
        return {
            min_ath_market_cap: parseInt(document.getElementById('minAthMarketCap').getAttribute('data-value') || '500000'),
            min_current_market_cap: parseInt(document.getElementById('minCurrentMarketCap').getAttribute('data-value') || '20000'),
            min_drawdown: parseFloat(document.getElementById('minDrawdown').value) || 50,
            max_drawdown: parseFloat(document.getElementById('maxDrawdown').value) || 90,
            max_results: parseInt(document.getElementById('maxResults').value) || 100
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

    startAnalysisTimer() {
        this.startTime = Date.now();
        this.analysisTimer = setInterval(() => {
            const elapsed = (Date.now() - this.startTime) / 1000;
            document.getElementById('elapsedTime').textContent = `${elapsed.toFixed(1)}s`;
        }, 100);
    }

    stopAnalysisTimer() {
        if (this.analysisTimer) {
            clearInterval(this.analysisTimer);
            this.analysisTimer = null;
        }
    }

    async analyze() {
        if (this.isAnalyzing) return;

        try {
            this.isAnalyzing = true;
            this.analyzeBtn.disabled = true;
            this.analyzeBtn.innerHTML = '<span class="btn-content"><i class="fas fa-spinner fa-spin"></i><span>Analyzing...</span></span>';

            this.hideError();
            this.hideResults();
            this.showProgress();
            this.startAnalysisTimer();

            const params = this.getFilterParams();
            this.validateFilters(params);

            const response = await fetch('/api/analyze', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(params)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.detail || 'Analysis error occurred');
            }

            this.currentData = data.data;
            await this.displayResults(data);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.isAnalyzing = false;
            this.analyzeBtn.disabled = false;
            this.analyzeBtn.innerHTML = '<span class="btn-content"><i class="fas fa-search"></i><span>Analyze Cryptocurrencies</span></span>';
            this.hideProgress();
            this.stopAnalysisTimer();
        }
    }

    showProgress() {
        this.progressSection.classList.remove('hidden');
        this.updateProgress(0, 'Starting analysis...');

        let progress = 0;
        const progressInterval = setInterval(() => {
            progress += Math.random() * 10;
            if (progress >= 90) {
                clearInterval(progressInterval);
                this.updateProgress(90, 'Finalizing results...');
            } else {
                this.updateProgress(progress, 'Processing market data...');
            }
        }, 500);

        this.progressInterval = progressInterval;
    }

    hideProgress() {
        this.progressSection.classList.add('hidden');
        if (this.progressInterval) {
            clearInterval(this.progressInterval);
        }
        this.updateProgress(0, '');
    }

    updateProgress(percent, text) {
        const progressFill = document.querySelector('.progress-fill');
        const progressText = document.getElementById('progressText');
        const coinsProcessed = document.getElementById('coinsProcessed');
        const analysisStatus = document.getElementById('analysisStatus');

        if (progressFill) progressFill.style.width = percent + '%';
        if (progressText) progressText.textContent = text;
        if (coinsProcessed) coinsProcessed.textContent = Math.floor(percent * 12) + ' / 1200';
        if (analysisStatus) analysisStatus.textContent = percent < 50 ? 'Fetching data...' : 'Analyzing...';
    }

    async displayResults(data) {
        this.updateProgress(100, 'Analysis complete!');

        this.resultsCount.innerHTML = `
            <i class="fas fa-chart-bar"></i>
            Found ${data.count} cryptocurrencies in ${data.processing_time}s
        `;

        this.generateTable(data.data);
        this.showResults();
        await this.animateTableRows();
    }

    generateTable(cryptos) {
        if (!cryptos || cryptos.length === 0) {
            this.resultsTable.innerHTML = `
                <div class="no-results" style="text-align: center; padding: 60px; color: var(--text-secondary);">
                    <i class="fas fa-search" style="font-size: 3rem; margin-bottom: 20px; display: block;"></i>
                    <h3 style="margin-bottom: 10px;">No Cryptocurrencies Found</h3>
                    <p>Try adjusting your search parameters</p>
                </div>
            `;
            return;
        }

        const tableHTML = `
            <table class="crypto-table">
                <thead>
                    <tr>
                        <th data-sort="index">#</th>
                        <th data-sort="name">Cryptocurrency</th>
                        <th data-sort="ath_price" class="number-cell">ATH Price ($)</th>
                        <th data-sort="current_price" class="number-cell">Current Price ($)</th>
                        <th data-sort="deviation_percent" class="number-cell">Deviation</th>
                        <th data-sort="current_market_cap" class="number-cell">Current Cap ($)</th>
                        <th data-sort="estimated_ath_market_cap" class="number-cell">ATH Cap ($)</th>
                        <th data-sort="drawdown_positive" class="number-cell">Drawdown</th>
                        <th data-sort="price_change_percentage_24h" class="number-cell">24h Change</th>
                        <th data-sort="rank" class="number-cell">Rank</th>
                    </tr>
                </thead>
                <tbody>
                    ${cryptos.map((crypto, index) => this.generateTableRow(crypto, index)).join('')}
                </tbody>
            </table>
        `;

        this.resultsTable.innerHTML = tableHTML;
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
            return change > 0 ? 'price-up' : 'price-down';
        };

        const formatChange = (change) => {
            if (change === null || change === undefined) return 'N/A';
            return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        };

        const cmcUrl = `https://coinmarketcap.com/currencies/${crypto.id}/`;

        // Добавляем индекс в данные для сортировки
        const cryptoWithIndex = { ...crypto, index: index + 1 };

        return `
            <tr class="table-row" style="opacity: 0; transform: translateX(-20px);">
                <td class="number-cell">${index + 1}</td>
                <td>
                    <a href="${cmcUrl}" target="_blank" class="crypto-link" title="View on CoinMarketCap">
                        ${crypto.image ? `<img src="${crypto.image}" alt="${crypto.name}" class="crypto-icon" onerror="this.style.display='none'">` : ''}
                        <span>${crypto.name} (${crypto.symbol})</span>
                    </a>
                </td>
                <td class="number-cell"><strong>${formatPrice(crypto.ath_price)}</strong></td>
                <td class="number-cell"><strong>${formatPrice(crypto.current_price)}</strong></td>
                <td class="negative number-cell"><strong>${crypto.deviation_percent}%</strong></td>
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
        const headers = this.resultsTable.querySelectorAll('th[data-sort]');
        headers.forEach(header => {
            // Удаляем старые обработчики
            header.replaceWith(header.cloneNode(true));
        });

        // Добавляем новые обработчики
        const newHeaders = this.resultsTable.querySelectorAll('th[data-sort]');
        newHeaders.forEach(header => {
            header.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const sortKey = header.getAttribute('data-sort');
                this.handleSort(sortKey, header);
            });
        });
    }

    handleSort(sortKey, header) {
        console.log('Sorting by:', sortKey);

        if (!this.currentData || this.currentData.length === 0) {
            console.log('No data to sort');
            return;
        }

        // Сбрасываем стили для всех заголовков
        const headers = this.resultsTable.querySelectorAll('th[data-sort]');
        headers.forEach(h => {
            h.classList.remove('sort-asc', 'sort-desc');
        });

        // Определяем направление сортировки
        const currentDirection = this.sortState[sortKey];
        let newDirection;

        if (currentDirection === 'asc') {
            newDirection = 'desc';
        } else if (currentDirection === 'desc') {
            newDirection = 'asc';
        } else {
            newDirection = 'asc';
        }

        // Сохраняем состояние сортировки
        this.sortState[sortKey] = newDirection;
        header.classList.add(`sort-${newDirection}`);

        // Сортируем данные
        const sortedData = [...this.currentData].sort((a, b) => {
            let aValue = a[sortKey];
            let bValue = b[sortKey];

            // Для индекса используем позицию в массиве
            if (sortKey === 'index') {
                aValue = this.currentData.indexOf(a);
                bValue = this.currentData.indexOf(b);
            }

            // Обработка разных типов данных
            if (typeof aValue === 'string') {
                aValue = aValue.toLowerCase();
                bValue = bValue.toLowerCase();
                if (newDirection === 'asc') {
                    return aValue.localeCompare(bValue);
                } else {
                    return bValue.localeCompare(aValue);
                }
            } else {
                // Числовые значения
                if (newDirection === 'asc') {
                    return aValue - bValue;
                } else {
                    return bValue - aValue;
                }
            }
        });

        // Обновляем данные и перерисовываем таблицу
        this.currentData = sortedData;
        this.reRenderTable();
    }

    reRenderTable() {
        if (!this.currentData || this.currentData.length === 0) return;

        const tbody = this.resultsTable.querySelector('tbody');
        if (!tbody) return;

        // Сохраняем текущее состояние анимации
        const rows = tbody.querySelectorAll('tr');
        rows.forEach(row => row.remove());

        // Добавляем отсортированные строки
        this.currentData.forEach((crypto, index) => {
            const rowHTML = this.generateTableRowHTML(crypto, index);
            tbody.insertAdjacentHTML('beforeend', rowHTML);
        });

        // Запускаем анимацию для новых строк
        this.animateTableRows();
    }

    generateTableRowHTML(crypto, index) {
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
            return change > 0 ? 'price-up' : 'price-down';
        };

        const formatChange = (change) => {
            if (change === null || change === undefined) return 'N/A';
            return `${change > 0 ? '+' : ''}${change.toFixed(2)}%`;
        };

        const cmcUrl = `https://coinmarketcap.com/currencies/${crypto.id}/`;

        return `
            <tr class="table-row" style="opacity: 0; transform: translateX(-20px);">
                <td class="number-cell">${index + 1}</td>
                <td>
                    <a href="${cmcUrl}" target="_blank" class="crypto-link" title="View on CoinMarketCap">
                        ${crypto.image ? `<img src="${crypto.image}" alt="${crypto.name}" class="crypto-icon" onerror="this.style.display='none'">` : ''}
                        <span>${crypto.name} (${crypto.symbol})</span>
                    </a>
                </td>
                <td class="number-cell"><strong>${formatPrice(crypto.ath_price)}</strong></td>
                <td class="number-cell"><strong>${formatPrice(crypto.current_price)}</strong></td>
                <td class="negative number-cell"><strong>${crypto.deviation_percent}%</strong></td>
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

    async animateTableRows() {
        const rows = this.resultsTable.querySelectorAll('.table-row');
        for (let i = 0; i < rows.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 30));
            rows[i].style.opacity = '1';
            rows[i].style.transform = 'translateX(0)';
            rows[i].style.transition = 'all 0.4s ease';
        }
    }

    showResults() {
        this.resultsSection.classList.remove('hidden');
        this.resultsSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    hideResults() {
        this.resultsSection.classList.add('hidden');
    }

    showError(message) {
        document.getElementById('errorMessage').textContent = message;
        this.errorSection.classList.remove('hidden');
        this.errorSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }

    hideError() {
        this.errorSection.classList.add('hidden');
    }

    resetFilters() {
        document.getElementById('minAthMarketCap').value = '500 000';
        document.getElementById('minAthMarketCap').setAttribute('data-value', '500000');

        document.getElementById('minCurrentMarketCap').value = '20 000';
        document.getElementById('minCurrentMarketCap').setAttribute('data-value', '20000');

        document.getElementById('minDrawdown').value = '50';
        document.getElementById('maxDrawdown').value = '90';
        document.getElementById('maxResults').value = '100';

        this.hideResults();
        this.hideError();
        this.currentData = [];
        this.sortState = {};
    }
}

// Инициализация при загрузке страницы
document.addEventListener('DOMContentLoaded', () => {
    new CryptoAnalyzer();
});