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
        this.bindEvents();
        this.checkServerStatus();
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
            input.style.borderColor = '#e1e5e9';
            return;
        }

        if (isNaN(value) || (min !== undefined && value < min) || (max !== undefined && value > max)) {
            input.style.borderColor = '#ef4444';
        } else {
            input.style.borderColor = '#10b981';
        }
    }

    getFilterParams() {
        return {
            min_ath_market_cap: parseFloat(document.getElementById('minAthMarketCap').value),
            min_current_market_cap: parseFloat(document.getElementById('minCurrentMarketCap').value),
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
            this.analyzeBtn.innerHTML = '⏳ Анализ...';

            this.hideError();
            this.hideResults();
            this.showLoading();

            const params = this.getFilterParams();
            this.validateFilters(params);

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

            await this.displayResults(data);

        } catch (error) {
            this.showError(error.message);
        } finally {
            this.isAnalyzing = false;
            this.analyzeBtn.disabled = false;
            this.analyzeBtn.innerHTML = '🔍 Анализировать';
            this.hideLoading();
        }
    }

    async displayResults(data) {
        this.resultsCountElement.textContent = `Найдено криптовалют: ${data.count}`;
        this.resultsTableElement.innerHTML = this.generateTableHTML(data.data);
        this.showResults();

        // Добавляем анимацию для строк таблицы
        await this.animateTableRows();
    }

    generateTableHTML(cryptos) {
        if (cryptos.length === 0) {
            return '<div class="no-results">🎯 Криптовалюты, соответствующие условиям, не найдены. Попробуйте изменить параметры фильтрации.</div>';
        }

        return `
            <table class="crypto-table">
                <thead>
                    <tr>
                        <th>#</th>
                        <th>Криптовалюта</th>
                        <th>Цена ($)</th>
                        <th>Текущая кап. ($)</th>
                        <th>ATH кап. ($)</th>
                        <th>Просадка</th>
                        <th>24ч</th>
                        <th>Ранг</th>
                    </tr>
                </thead>
                <tbody>
                    ${cryptos.map((crypto, index) => this.generateTableRow(crypto, index + 1)).join('')}
                </tbody>
            </table>
        `;
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

        return `
            <tr class="table-row" style="opacity: 0; transform: translateX(-20px);">
                <td>${index}</td>
                <td>
                    <div class="crypto-name">
                        ${crypto.image ? `<img src="${crypto.image}" alt="${crypto.name}" class="crypto-icon" onerror="this.style.display='none'">` : ''}
                        <span>${crypto.name} (${crypto.symbol})</span>
                    </div>
                </td>
                <td><strong>${formatPrice(crypto.current_price)}</strong></td>
                <td>${formatCurrency(crypto.current_market_cap)}</td>
                <td><strong>${formatCurrency(crypto.estimated_ath_market_cap)}</strong></td>
                <td class="negative"><strong>${crypto.drawdown_percent}%</strong></td>
                <td class="${get24hChangeClass(crypto.price_change_percentage_24h)}">
                    <strong>${format24hChange(crypto.price_change_percentage_24h)}</strong>
                </td>
                <td><span class="neutral">${crypto.rank}</span></td>
            </tr>
        `;
    }

    async animateTableRows() {
        const rows = document.querySelectorAll('.table-row');
        for (let i = 0; i < rows.length; i++) {
            await new Promise(resolve => setTimeout(resolve, 50));
            rows[i].style.opacity = '1';
            rows[i].style.transform = 'translateX(0)';
            rows[i].style.transition = 'all 0.4s ease';
        }
    }

    resetFilters() {
        document.getElementById('minAthMarketCap').value = 500000;
        document.getElementById('minCurrentMarketCap').value = 20000;
        document.getElementById('minDrawdown').value = -90;
        document.getElementById('maxDrawdown').value = -50;
        document.getElementById('maxResults').value = 50;

        // Сбрасываем стили валидации
        document.querySelectorAll('.filter-group input').forEach(input => {
            input.style.borderColor = '#e1e5e9';
        });

        this.hideResults();
        this.hideError();
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

    // Добавляем плавную прокрутку к результатам
    const smoothScrollToResults = () => {
        const resultsElement = document.getElementById('results');
        if (resultsElement && !resultsElement.classList.contains('hidden')) {
            resultsElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    };

    // Глобальная функция для обработки ошибок изображений
    window.handleImageError = function(img) {
        img.style.display = 'none';
    };
});