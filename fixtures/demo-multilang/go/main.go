package main

import "net/http"

type OrderHandler struct{}

func CreateOrder(w http.ResponseWriter, r *http.Request) {
	http.HandleFunc("/orders", CreateOrder)
}

func main() {
	http.HandleFunc("/orders", CreateOrder)
}
