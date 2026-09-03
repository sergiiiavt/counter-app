import Foundation

func currentLocalDateString(date: Date = Date()) -> String {
    let parts = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(format: "%04d-%02d-%02d", parts.year ?? 0, parts.month ?? 0, parts.day ?? 0)
}

func currentISO8601String(date: Date = Date()) -> String {
    ISO8601DateFormatter.counterApp.string(from: date)
}

func displayTime(from iso8601: String) -> String {
    guard let date = ISO8601DateFormatter.counterApp.date(from: iso8601) else { return "" }
    return DateFormatter.counterAppTime.string(from: date)
}

extension ISO8601DateFormatter {
    static let counterApp: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()
}

extension DateFormatter {
    static let counterAppTime: DateFormatter = {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        formatter.dateStyle = .none
        return formatter
    }()
}
