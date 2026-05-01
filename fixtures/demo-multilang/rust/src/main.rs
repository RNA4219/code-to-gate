use std::env;

pub struct OrderHandler;

pub fn create_order() {
    let _database_url = env::var("DATABASE_URL").unwrap();
}

fn main() {
    create_order();
}
