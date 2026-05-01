class OrderService
  def create(params)
    query = "SELECT * FROM orders WHERE user_id = #{params[:user_id]}"
    db.execute(query)
  end
end
