require_relative "../lib/order_service"

RSpec.describe OrderService do
  it "creates an order" do
    expect(OrderService.new).to be
  end
end
