<?php

use App\Service\OrderService;

class OrderController {
    public function createOrder() {
        $dsn = getenv("DATABASE_URL");
        Route::post("/orders", "OrderController@createOrder");
    }
}
