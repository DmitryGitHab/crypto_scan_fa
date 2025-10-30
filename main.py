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
import random
from typing import Optional, List
from pydantic import BaseModel


class FilterParams(BaseModel):
    min_ath_market_cap: float = 500000
    max_drawdown: float = 50
    min_drawdown: float = 90
    min_current_market_cap: float = 20000
    max_results: int = 100


app = FastAPI(title="Crypto Analyzer Pro", version="3.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/static", StaticFiles(directory="static"), name="static")
templates = Jinja2Templates(directory="templates")


class CryptoAnalyzer:
    def __init__(self):
        self.base_url = "https://api.coingecko.com/api/v3"
        self.request_count = 0
        self.start_time = time.time()
        self.last_request_time = 0

    async def fetch_data(self, session, url):
        current_time = time.time()

        if current_time - self.last_request_time < 2:
            await asyncio.sleep(2 - (current_time - self.last_request_time))

        elapsed_time = current_time - self.start_time
        if self.request_count >= 40 and elapsed_time < 60:
            wait_time = 60 - elapsed_time + random.uniform(1, 3)
            print(f"🔒 Rate limit protection: waiting {wait_time:.1f} seconds...")
            await asyncio.sleep(wait_time)
            self.request_count = 0
            self.start_time = time.time()

        try:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as response:
                self.request_count += 1
                self.last_request_time = time.time()

                if response.status == 200:
                    return await response.json()
                elif response.status == 429:
                    wait_time = 60 + random.uniform(5, 15)
                    print(f"⏳ Rate limit exceeded. Waiting {wait_time:.1f} seconds...")
                    await asyncio.sleep(wait_time)
                    return await self.fetch_data(session, url)
                else:
                    print(f"❌ API Error {response.status} for {url}")
                    return None
        except asyncio.TimeoutError:
            print(f"⏰ Timeout for {url}")
            return None
        except Exception as e:
            print(f"🚨 Request error {url}: {e}")
            return None

    def calculate_deviation(self, current_price, ath_price):
        if ath_price == 0 or current_price is None or ath_price is None:
            return 0
        return ((current_price - ath_price) / ath_price) * 100

    async def get_all_cryptos(self, session):
        all_cryptos = []

        for page in range(1, 6):
            url = f"{self.base_url}/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=250&page={page}&sparkline=false"
            print(f"📄 Fetching page {page}...")

            data = await self.fetch_data(session, url)
            if data:
                all_cryptos.extend(data)
            else:
                break

            await asyncio.sleep(1)

        unique_cryptos = {}
        for crypto in all_cryptos:
            if crypto['id'] not in unique_cryptos:
                unique_cryptos[crypto['id']] = crypto

        return list(unique_cryptos.values())

    def filter_cryptocurrencies(self, crypto_data, filter_params: FilterParams):
        filtered = []

        for crypto in crypto_data:
            try:
                if not crypto:
                    continue

                current_price = crypto.get('current_price', 0)
                current_market_cap = crypto.get('market_cap', 0)
                ath_price = crypto.get('ath', 0)

                ath_change_percentage = crypto.get('ath_change_percentage')
                if ath_change_percentage is not None:
                    drawdown_percentage = ath_change_percentage
                else:
                    drawdown_percentage = self.calculate_deviation(current_price, ath_price)

                if ath_price > 0 and current_price > 0:
                    estimated_ath_market_cap = (ath_price / current_price) * current_market_cap
                else:
                    estimated_ath_market_cap = 0

                drawdown_positive = abs(drawdown_percentage)

                conditions_met = (
                        estimated_ath_market_cap >= filter_params.min_ath_market_cap and
                        current_market_cap >= filter_params.min_current_market_cap and
                        ath_price > 0 and
                        current_price > 0 and
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
                        'deviation_percent': round(self.calculate_deviation(current_price, ath_price), 2),
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
        async with aiohttp.ClientSession() as session:
            print("🚀 Starting crypto analysis...")
            start_time = time.time()

            cryptocurrencies = await self.get_all_cryptos(session)

            if not cryptocurrencies:
                return []

            print(f"✅ Received {len(cryptocurrencies)} unique cryptocurrencies")

            filtered_cryptos = self.filter_cryptocurrencies(cryptocurrencies, filter_params)

            analysis_time = time.time() - start_time
            print(f"⏱️ Analysis completed in {analysis_time:.2f} seconds. Found {len(filtered_cryptos)} results")

            return filtered_cryptos


analyzer = CryptoAnalyzer()


@app.get("/", response_class=HTMLResponse)
async def read_root(request: Request):
    return templates.TemplateResponse("index.html", {"request": request})


@app.post("/api/analyze")
async def analyze_cryptos(params: FilterParams):
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
    return {
        "status": "online",
        "timestamp": datetime.now().isoformat(),
        "service": "Crypto Analyzer Pro v3.0",
        "requests_count": analyzer.request_count
    }


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8000, reload=True)