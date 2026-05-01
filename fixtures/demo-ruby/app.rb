require "json"
require_relative "lib/order_service"

class OrderApp
  DEFAULT_LIMIT = 100

  def create_order(params)
    service = OrderService.new
    service.create(params)
  rescue
    nil
  end
end

post "/orders" do
  OrderApp.new.create_order(params)
end

if __FILE__ == $PROGRAM_NAME
  puts "starting order app"
end
