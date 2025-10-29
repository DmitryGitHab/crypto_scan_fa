from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import aiohttp
import asyncio
import json
from datetime import datetime
import os
import time
from typing import Optional, List
from pydantic import BaseModel
import math


class FilterParams(BaseModel):
    min_ath_market_cap: float = 500000
    max_drawdown: float = 50
    min_drawdown: float = 90
    min_current_market_cap: float = 20000
    max_results: int = 100


app = FastAPI(title="Crypto Analyzer Pro", version="3.0.0")

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Монтируем статические файлы
app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class CryptoAnalyzer:
    def __init__(self):
        self.base_url = "https://api.coingecko.com/api/v3"
        self.request_count = 0
        self.start_time = time.time()

    async def fetch_data(self, session, url):
        """Асинхронный запрос к API с обработкой rate limits"""
        elapsed_time = time.time() - self.start_time
        if self.request_count >= 45 and elapsed_time < 60:
            wait_time = 60 - elapsed_time + 1
            print(f"Достигнут лимит запросов. Ожидание {wait_time:.1f} секунд...")
            await asyncio.sleep(wait_time)
            self.request_count = 0
            self.start_time = time.time()

        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                self.request_count += 1

                if response.status == 200:
                    return await response.json()
                elif response.status == 429:
                    print("Превышен лимит запросов. Ожидание 60 секунд...")
                    await asyncio.sleep(60)
                    return await self.fetch_data(session, url)
                else:
                    print(f"Ошибка API: {response.status} для {url}")
                    return None
        except asyncio.TimeoutError:
            print(f"Таймаут запроса: {url}")
            return None
        except Exception as e:
            print(f"Ошибка при запросе {url}: {e}")
            return None

    def calculate_deviation(self, current_price, ath_price):
        """Расчет отклонения текущей цены от максимальной"""
        if ath_price == 0 or current_price is None or ath_price is None:
            return 0
        return ((current_price - ath_price) / ath_price) * 100

    async def get_all_cryptos(self, session):
        """Получение всех криптовалют с пагинацией"""
        all_cryptos = []

        # Получаем данные с нескольких страниц для большего охвата
        for page in range(1, 6):  # 5 страниц по 250 = 1250 криптовалют
            url = f"{self.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page={page}&sparkline=false"
            print(f"Загружаем страницу {page}...")

            data = await self.fetch_data(session, url)
            if data:
                all_cryptos.extend(data)

            # Задержка между запросами для избежания rate limits
            if page < 5:
                await asyncio.sleep(1)

        # Убираем дубликаты по id
        seen_ids = set()
        unique_cryptos = []
        for crypto in all_cryptos:
            if crypto['id'] not in seen_ids:
                seen_ids.add(crypto['id'])
                unique_cryptos.append(crypto)

        return unique_cryptos

    def filter_cryptocurrencies(self, crypto_data, filter_params: FilterParams):
        """Фильтрация криптовалют по заданным условиям"""
        filtered = []

        for crypto in crypto_data:
            try:
                if not crypto:
                    continue

                current_price = crypto.get('current_price', 0)
                current_market_cap = crypto.get('market_cap', 0)
                ath_price = crypto.get('ath', 0)

                # Пропускаем криптовалюты с нулевой или отсутствующей ценой
                if not current_price or not ath_price or current_price <= 0 or ath_price <= 0:
                    continue

                # Получаем процент изменения от ATH
                ath_change_percentage = crypto.get('ath_change_percentage')
                if ath_change_percentage is not None:
                    drawdown_percentage = ath_change_percentage
                else:
                    drawdown_percentage = self.calculate_deviation(current_price, ath_price)

                # Оцениваем ATH капитализацию
                estimated_ath_market_cap = (ath_price / current_price) * current_market_cap

                # Преобразуем просадку в положительное число для сравнения
                drawdown_positive = abs(drawdown_percentage)

                # Расчет отклонения цены
                price_deviation = self.calculate_deviation(current_price, ath_price)

                # Проверяем условия
                conditions_met = (
                        estimated_ath_market_cap >= filter_params.min_ath_market_cap and
                        current_market_cap >= filter_params.min_current_market_cap and
                        filter_params.min_drawdown <= drawdown_positive <= filter_params.max_drawdown
                )

                if conditions_met:
                    crypto_info = {
                        'name': crypto.get('name', 'N/A'),
                        'symbol': crypto.get('symbol', 'N/A').upper(),
                        'current_price': current_price,
                        'ath_price': ath_price,
                        'current_market_cap': current_market_cap,
                        'ath_date': crypto.get('ath_date', 'N/A'),
                        'estimated_ath_market_cap': estimated_ath_market_cap,
                        'drawdown_percent': round(drawdown_percentage, 2),
                        'drawdown_positive': round(drawdown_positive, 2),
                        'price_deviation': round(price_deviation, 2),
                        'rank': crypto.get('market_cap_rank', 'N/A'),
                        'id': crypto.get('id', ''),
                        'price_change_24h': crypto.get('price_change_24h', 0),
                        'price_change_percentage_24h': crypto.get('price_change_percentage_24h', 0),
                        'image': crypto.get('image', ''),
                        'last_updated': crypto.get('last_updated', '')
                    }
                    filtered.append(crypto_info)

            except (KeyError, TypeError, ZeroDivisionError, AttributeError) as e:
                continue

        return filtered[:filter_params.max_results]

    async def analyze_cryptocurrencies(self, filter_params: FilterParams):
        """Основная функция анализа криптовалют"""
        async with aiohttp.ClientSession() as session:
            print("🔄 Получаем расширенный список криптовалют...")
            cryptocurrencies = await self.get_all_cryptos(session)

            if not cryptocurrencies:
                return []

            print(f"✅ Получено {len(cryptocurrencies)} уникальных криптовалют")

            # Фильтруем по условиям
            filtered_cryptos = self.filter_cryptocurrencies(cryptocurrencies, filter_params)

            print(f"🎯 Найдено {len(filtered_cryptos)} криптовалют, соответствующих критериям")
            return filtered_cryptos


analyzer = CryptoAnalyzer()


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    """Главная страница"""
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/analyze")
async def analyze_cryptos(params: FilterParams):
    """API endpoint для анализа криптовалют"""
    try:
        start_time = time.time()
        results = await analyzer.analyze_cryptocurrencies(params)
        processing_time = time.time() - start_time

        return {
            "success": True,
            "data": results,
            "count": len(results),
            "processing_time": round(processing_time, 2),
            "timestamp": datetime.now().isoformat()
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/status")
async def get_status():
    """Проверка статуса API"""
    return {
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "service": "Crypto Analyzer Pro v3.0",
        "requests_count": analyzer.request_count
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, log_level="info")