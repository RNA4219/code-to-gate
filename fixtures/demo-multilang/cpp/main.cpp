#include <iostream>

class OrderController {
public:
  void CreateOrder() {
    std::cout << "order";
  }
};

int main() {
  OrderController controller;
  controller.CreateOrder();
  return 0;
}
