// Unicode content - Japanese/Chinese characters
// 日本語コメント - Japanese comment
// 中文注释 - Chinese comment
// 한국어 주석 - Korean comment

export const greetings = {
  japanese: "こんにちは世界",  // Hello World
  chinese: "你好世界",         // Hello World
  korean: "안녕하세요 세계",    // Hello World
  arabic: "مرحبا بالعالم",     // Hello World
  hebrew: "שלום עולם",         // Hello World
  russian: "Привет мир",       // Hello World
  greek: "Γειά σου κόσμε",     // Hello World
  thai: "สวัสดีโลก",           // Hello World
  emoji: "👋🌍"                // Wave + Earth
};

export function greetInLanguage(lang) {
  return greetings[lang] || greetings.emoji;
}

// Unicode identifiers (valid in JavaScript)
const 変数 = "variable in Japanese";
const 变量 = "variable in Chinese";
const 변수 = "variable in Korean";

export { 変数, 变量, 변수 };