package main

import "fmt"

type Service struct{}

func (s *Service) Run() string {
	return "ok"
}

func main() {
	fmt.Println((&Service{}).Run())
}
