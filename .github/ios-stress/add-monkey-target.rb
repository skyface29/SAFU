# Добавляет в project.yml цель с тестом-«обезьяной» и схему для неё (только для стресс-теста в CI).
# Запуск из папки проекта: ruby add-monkey-target.rb <папка с MonkeyTests.swift>
require "yaml"

src = ARGV[0] || "Monkey"
spec = YAML.load_file("project.yml")
spec["targets"]["SAFUMonkey"] = {
  "type" => "bundle.ui-testing",
  "platform" => "iOS",
  "sources" => [src],
  "dependencies" => [{ "target" => "SAFU" }],
  "settings" => { "base" => {
    "PRODUCT_BUNDLE_IDENTIFIER" => "ru.student.safuhub.monkey",
    "TEST_TARGET_NAME" => "SAFU",
    "GENERATE_INFOPLIST_FILE" => "YES",
  } },
}
spec["schemes"] = (spec["schemes"] || {}).merge(
  "SAFUMonkey" => {
    "build" => { "targets" => { "SAFU" => "all", "SAFUMonkey" => ["test"] } },
    "test" => { "config" => "Debug", "targets" => ["SAFUMonkey"] },
  }
)
File.write("project.yml", spec.to_yaml)
puts "SAFUMonkey добавлен"
