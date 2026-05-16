using Microsoft.AspNetCore.Mvc;

public class OrderController
{
    [HttpPost("/orders")]
    public void CreateOrder()
    {
    }

    public static void Main(string[] args)
    {
        new OrderController().CreateOrder();
    }
}
