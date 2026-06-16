use std::fmt::Display;

pub struct Service;

impl Service {
    pub fn run(&self) -> &'static str {
        "ok"
    }
}

pub fn print_value<T: Display>(value: T) {
    println!("{}", value);
}
