from fastapi import FastAPI, Request, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.responses import HTMLResponse, JSONResponse
import aiohttp
import asyncio
import json
from datetime import datetime
import os
import time
from typing import Optional
from pydantic import BaseModel


class FilterParams(BaseModel):
    min_ath_market_cap: float = 500000
    max_drawdown: float = -50
    min_drawdown: float = -90
    min_current_market_cap: float = 20000
    max_results: int = 100


app = FastAPI(title="Crypto Analyzer", version="1.0.0")

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
            async with session.get(url) as response:
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
        except Exception as e:
            print(f"Ошибка при запросе {url}: {e}")
            return None

    def calculate_drawdown(self, current_price, ath_price):
        """Расчет просадки от ATH"""
        if ath_price == 0 or current_price is None or ath_price is None:
            return 0
        return ((current_price - ath_price) / ath_price) * 100

    async def get_top_cryptos(self, session, per_page=200):
        """Получение топ криптовалют с основными данными"""
        url = f"{self.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page={per_page}&page=1&sparkline=false"
        data = await self.fetch_data(session, url)
        return data if data else []

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

                # Получаем процент изменения от ATH
                ath_change_percentage = crypto.get('ath_change_percentage')
                if ath_change_percentage is not None:
                    drawdown_percentage = ath_change_percentage
                else:
                    drawdown_percentage = self.calculate_drawdown(current_price, ath_price)

                # Оцениваем ATH капитализацию
                if ath_price > 0 and current_price > 0:
                    estimated_ath_market_cap = (ath_price / current_price) * current_market_cap
                else:
                    estimated_ath_market_cap = 0

                # Проверяем условия
                conditions_met = (
                        estimated_ath_market_cap >= filter_params.min_ath_market_cap and
                        current_market_cap >= filter_params.min_current_market_cap and
                        ath_price > 0 and current_price > 0 and
                        filter_params.min_drawdown <= drawdown_percentage <= filter_params.max_drawdown
                )

                if conditions_met:
                    crypto_info = {
                        'name': crypto.get('name', 'N/A'),
                        'symbol': crypto.get('symbol', 'N/A').upper(),
                        'current_price': current_price,
                        'current_market_cap': current_market_cap,
                        'ath_price': ath_price,
                        'ath_date': crypto.get('ath_date', 'N/A'),
                        'estimated_ath_market_cap': estimated_ath_market_cap,
                        'drawdown_percent': round(drawdown_percentage, 2),
                        'rank': crypto.get('market_cap_rank', 'N/A'),
                        'id': crypto.get('id', ''),
                        'price_change_24h': crypto.get('price_change_24h', 0),
                        'price_change_percentage_24h': crypto.get('price_change_percentage_24h', 0),
                        'image': crypto.get('image', '')
                    }
                    filtered.append(crypto_info)

            except (KeyError, TypeError, ZeroDivisionError, AttributeError) as e:
                continue

        return filtered[:filter_params.max_results]

    async def analyze_cryptocurrencies(self, filter_params: FilterParams):
        """Основная функция анализа криптовалют"""
        async with aiohttp.ClientSession() as session:
            print("Получаем список топ криптовалют...")
            cryptocurrencies = await self.get_top_cryptos(session, 300)

            if not cryptocurrencies:
                return []

            print(f"Получено {len(cryptocurrencies)} криптовалют")

            # Фильтруем по условиям
            filtered_cryptos = self.filter_cryptocurrencies(cryptocurrencies, filter_params)

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
        results = await analyzer.analyze_cryptocurrencies(params)

        return {
            "success": True,
            "data": results,
            "count": len(results),
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
        "service": "Crypto Analyzer"
    }


if __name__ == "__main__":
    import uvicorn

