//
//  AnnouncementService.swift
//  XIV on Mac
//

import Foundation

enum AnnouncementService {
    private static let sourceURL = URL(string: "https://user-cdn.ffxiv.com.tw/news/251115/launcher_left.html")!
    private static let maximumResponseSize = 1_000_000
    private static let maximumItemSize = 16_384
    private static let itemMarker = #"<div class="item">"#
    // shortcut: 固定官方目前的 HTML 結構，公告格式改變時更新這些受限解析規則。
    private static let dateExpression = try! NSRegularExpression(pattern: #"<div class="publish_date">\s*([^<]{1,64})"#)
    private static let typeExpression = try! NSRegularExpression(pattern: #"<div class="type\s+(event|update|maintain|other)\b"#)
    private static let linkExpression = try! NSRegularExpression(pattern: #"<a\s+[^<>]*href\s*=\s*"([^"<>]{1,2048})"[^<>]*>([^<]{1,2048})</a>"#)
    private static let bannerExpression = try! NSRegularExpression(
        pattern: #"<div\s+class="swiper-slide">\s*<a\s+href="([^"<>]{1,2048})"[^<>]*>\s*<img\s+src\s*=\s*"([^"<>]{1,2048})""#,
        options: .caseInsensitive)
    private static let pinnedExpression = try! NSRegularExpression(pattern: #"<span\s+class="badge top">"#)
    private static let entityExpression = try! NSRegularExpression(pattern: #"&(#x[0-9a-fA-F]{1,8}|#[0-9]{1,10}|amp|lt|gt|quot|apos|nbsp);"#)

    static func fetch() async throws -> [String: Any] {
        var request = URLRequest(url: sourceURL)
        request.timeoutInterval = 15
        request.cachePolicy = .reloadIgnoringLocalCacheData
        request.setValue("XIV-on-Mac", forHTTPHeaderField: "User-Agent")

        let configuration = URLSessionConfiguration.ephemeral
        configuration.timeoutIntervalForResource = 15
        let session = URLSession(configuration: configuration)
        defer { session.invalidateAndCancel() }
        let (bytes, response) = try await session.bytes(for: request)
        guard let httpResponse = response as? HTTPURLResponse,
              httpResponse.statusCode == 200,
              httpResponse.url == sourceURL,
              httpResponse.expectedContentLength <= Int64(maximumResponseSize) || httpResponse.expectedContentLength == -1 else {
            throw URLError(.badServerResponse)
        }

        var data = Data()
        for try await byte in bytes {
            data.append(byte)
            guard data.count <= maximumResponseSize else {
                throw URLError(.dataLengthExceedsMaximum)
            }
        }
        guard let html = String(data: data, encoding: .utf8) else {
            throw URLError(.cannotDecodeContentData)
        }
        return try parse(html)
    }

    static func isAllowedLink(_ url: URL) -> Bool {
        guard url.scheme?.lowercased() == "https",
              let host = url.host?.lowercased(),
              (host == "ffxiv.com.tw" || host.hasSuffix(".ffxiv.com.tw")),
              url.port == nil || url.port == 443,
              url.user == nil,
              url.password == nil else {
            return false
        }
        return true
    }

    static func parse(_ html: String) throws -> [String: Any] {
        guard html.utf8.count <= maximumResponseSize else {
            throw URLError(.dataLengthExceedsMaximum)
        }

        var items: [[String: String]] = []
        var urls = Set<String>()
        var searchStart = html.startIndex
        var scannedItems = 0

        while items.count < 50, scannedItems < 200,
              let marker = html.range(of: itemMarker, range: searchStart..<html.endIndex) {
            scannedItems += 1
            let contentStart = marker.upperBound
            let nextMarker = html.range(of: itemMarker, range: contentStart..<html.endIndex)?.lowerBound ?? html.endIndex
            let itemEnd = html.index(contentStart, offsetBy: maximumItemSize, limitedBy: nextMarker) ?? nextMarker
            let item = String(html[contentStart..<itemEnd])
            searchStart = nextMarker

            guard let date = capture(dateExpression, in: item, group: 1),
                  let type = capture(typeExpression, in: item, group: 1),
                  let href = capture(linkExpression, in: item, group: 1),
                  let title = capture(linkExpression, in: item, group: 2),
                  let url = URL(string: decodeEntities(href)),
                  isAllowedLink(url) else {
                continue
            }

            let decodedTitle = decodeEntities(title).trimmingCharacters(in: .whitespacesAndNewlines)
            guard !decodedTitle.isEmpty, urls.insert(url.absoluteString).inserted else { continue }
            items.append([
                "date": decodeEntities(date).trimmingCharacters(in: .whitespacesAndNewlines),
                "category": category(for: type),
                "title": decodedTitle,
                "url": url.absoluteString,
                "isPinned": pinnedExpression.firstMatch(in: item, range: NSRange(item.startIndex..., in: item)) != nil ? "true" : "false"
            ])
        }

        guard !items.isEmpty else { throw URLError(.cannotParseResponse) }
        var banners: [[String: String]] = []
        bannerExpression.enumerateMatches(in: html, range: NSRange(html.startIndex..., in: html)) { match, _, stop in
            guard let match = match,
                  let linkRange = Range(match.range(at: 1), in: html),
                  let imageRange = Range(match.range(at: 2), in: html),
                  let url = URL(string: decodeEntities(String(html[linkRange]))),
                  let imageURL = URL(string: decodeEntities(String(html[imageRange]))),
                  isAllowedLink(url), isAllowedLink(imageURL) else { return }
            banners.append(["url": url.absoluteString, "imageUrl": imageURL.absoluteString])
            if banners.count == 10 { stop.pointee = true }
        }
        return ["items": items, "banners": banners, "moreUrl": "https://www.ffxiv.com.tw/web/news/news_list.aspx"]
    }

    private static func capture(_ expression: NSRegularExpression, in value: String, group: Int) -> String? {
        guard let match = expression.firstMatch(in: value, range: NSRange(value.startIndex..., in: value)),
              let range = Range(match.range(at: group), in: value) else {
            return nil
        }
        return String(value[range])
    }

    private static func category(for type: String) -> String {
        switch type {
        case "event": return "活動"
        case "update": return "更新"
        case "maintain": return "維護"
        default: return "其他"
        }
    }

    private static func decodeEntities(_ value: String) -> String {
        let matches = entityExpression.matches(in: value, range: NSRange(value.startIndex..., in: value))
        var result = value
        for match in matches.reversed() {
            guard let range = Range(match.range, in: result),
                  let entityRange = Range(match.range(at: 1), in: result) else { continue }
            let entity = String(result[entityRange])
            let replacement: String
            switch entity {
            case "amp": replacement = "&"
            case "lt": replacement = "<"
            case "gt": replacement = ">"
            case "quot": replacement = "\""
            case "apos": replacement = "'"
            case "nbsp": replacement = " "
            case let value where value.hasPrefix("#x"):
                replacement = UInt32(value.dropFirst(2), radix: 16).flatMap(UnicodeScalar.init).map(String.init) ?? ""
            default:
                replacement = UInt32(entity.dropFirst()).flatMap(UnicodeScalar.init).map(String.init) ?? ""
            }
            result.replaceSubrange(range, with: replacement)
        }
        return result
    }
}
