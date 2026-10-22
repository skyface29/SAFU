import XCTest
import ObjectiveC

// «Обезьяна» для стресс-теста Арктики: случайные касания, свайпы, жест «назад», долгие нажатия, ввод текста.
// Цель подключается только в CI (add-monkey-target.rb), в проект приложения не попадает.
// Параметры — из окружения xcodebuild: TEST_RUNNER_MONKEY_EVENTS, TEST_RUNNER_MONKEY_SEED.

/// Повторяемые случайные числа: один и тот же seed — те же события
struct SeededGenerator: RandomNumberGenerator {
    private var state: UInt64
    init(seed: UInt64) { state = seed &+ 0x9E3779B97F4A7C15 }
    mutating func next() -> UInt64 {
        state &+= 0x9E3779B97F4A7C15
        var z = state
        z = (z ^ (z >> 30)) &* 0xBF58476D1CE4E5B9
        z = (z ^ (z >> 27)) &* 0x94D049BB133111EB
        return z ^ (z >> 31)
    }
}

/// XCUITest перед каждым событием ждёт, пока в приложении закончатся анимации. У Арктики живой фон
/// анимируется всегда — ожидание шло бы до тайм-аута на каждом касании. Отключаем его.
enum Quiescence {
    static func disable() {
        // только известные классы: перебор всех классов рантайма роняет раннер на «чужих» классах
        var done = 0
        for cname in ["XCUIApplicationProcess", "XCUIApplicationImpl"] {
            guard let cls = NSClassFromString(cname) else { continue }
            var count: UInt32 = 0
            guard let methods = class_copyMethodList(cls, &count) else { continue }
            for i in 0..<Int(count) {
                let m = methods[i]
                let name = NSStringFromSelector(method_getName(m))
                guard name.hasPrefix("waitForQuiescence") || name.hasPrefix("_waitForQuiescence") else { continue }
                let block: @convention(block) (AnyObject) -> Bool = { _ in true }
                method_setImplementation(m, imp_implementationWithBlock(block))
                print("MONKEY: без ожидания анимаций — \(cname).\(name)")
                done += 1
            }
            free(methods)
        }
        if done == 0 { print("MONKEY: ожидание анимаций отключить не удалось") }
    }
}

final class MonkeyTests: XCTestCase {
    private let bundle = "ru.student.safuhub"

    override func setUp() {
        super.setUp()
        continueAfterFailure = true
        Quiescence.disable()
    }

    func testMonkey() {
        let env = ProcessInfo.processInfo.environment
        let events = Int(env["MONKEY_EVENTS"] ?? "") ?? 1500
        var rng = SeededGenerator(seed: UInt64(env["MONKEY_SEED"] ?? "") ?? 42)
        let app = XCUIApplication(bundleIdentifier: bundle)
        let springboard = XCUIApplication(bundleIdentifier: "com.apple.springboard")
        if app.state != .runningForeground { app.activate() }
        sleep(2)

        var relaunches = 0
        var left = 0
        let started = Date()
        func r(_ a: Double, _ b: Double) -> Double { Double.random(in: a...b, using: &rng) }
        // координаты считаем от SpringBoard: его дерево крошечное, а касание всё равно приходит в приложение
        // на экране (от самого приложения XCUITest на каждое касание обходил бы всё дерево SwiftUI — секунды)
        func point(_ x: Double, _ y: Double) -> XCUICoordinate {
            springboard.coordinate(withNormalizedOffset: CGVector(dx: x, dy: y))
        }

        for i in 0..<events {
            switch app.state {
            case .runningForeground:
                break
            case .notRunning, .unknown:
                relaunches += 1
                print("MONKEY: приложения нет на событии \(i) — открываю снова")
                app.activate()
                sleep(2)
            default:
                // ушли в Safari, «Поделиться» другого приложения, Настройки — возвращаемся
                left += 1
                app.activate()
            }
            // системные окна (разрешения, «Открыть в …?») — нажимаем первую кнопку
            if i % 40 == 0, springboard.alerts.count > 0 {
                springboard.alerts.firstMatch.buttons.firstMatch.tap()
            }
            let kind = Int.random(in: 0..<100, using: &rng)
            let p = point(r(0.03, 0.97), r(0.06, 0.97))
            switch kind {
            case 0..<52:
                p.tap()
            case 52..<64:
                // прокрутка и свайпы по экрану
                p.press(forDuration: 0.02, thenDragTo: point(r(0.05, 0.95), r(0.08, 0.95)))
            case 64..<72:
                // жест «назад» от левого края
                let y = r(0.2, 0.85)
                point(0.005, y).press(forDuration: 0.02, thenDragTo: point(r(0.5, 0.9), y))
            case 72..<77:
                // закрыть лист свайпом вниз
                point(0.5, r(0.12, 0.3)).press(forDuration: 0.02, thenDragTo: point(0.5, 0.97))
            case 77..<83:
                // долгое нажатие: меню, перетаскивание значков и блоков
                p.press(forDuration: r(0.6, 1.4))
            case 83..<86:
                p.doubleTap()
            case 86..<89:
                // ввод текста — касаниями по клавишам экранной клавиатуры внизу экрана (нет клавиатуры — просто
                // касания). Спрашивать приложение (app.keyboards, typeText) нельзя: это обход всего дерева SwiftUI,
                // он упирался в тайм-аут запроса, а typeText падал, если фокус уходил между проверкой и вводом
                for _ in 0..<Int.random(in: 3...12, using: &rng) {
                    point(r(0.04, 0.96), r(0.72, 0.93)).tap()
                }
            case 89..<91:
                p.tap()
            case 91..<94:
                // свернуть и вернуться
                XCUIDevice.shared.press(.home)
                usleep(400_000)
                app.activate()
            case 94..<97:
                // нижняя панель вкладок
                point(r(0.08, 0.92), 0.955).tap()
            default:
                // кнопки в правом и левом верхнем углу
                point(Bool.random(using: &rng) ? r(0.82, 0.96) : r(0.04, 0.18), r(0.06, 0.1)).tap()
            }
            if i > 0 && i % 100 == 0 {
                print("MONKEY: \(i) событий за \(Int(Date().timeIntervalSince(started))) с, приложение: \(app.state.rawValue)")
            }
        }
        print("MONKEY: готово, событий \(events) за \(Int(Date().timeIntervalSince(started))) с, перезапусков \(relaunches), выходов из приложения \(left)")
    }
}
