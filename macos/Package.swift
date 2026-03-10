// swift-tools-version: 6.0

import PackageDescription

let package = Package(
    name: "TokenHero",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "TokenHero", targets: ["TokenHero"]),
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/websocket-kit.git", from: "2.15.0"),
    ],
    targets: [
        .executableTarget(
            name: "TokenHero",
            dependencies: [
                .product(name: "WebSocketKit", package: "websocket-kit"),
            ],
            path: "TokenHero",
            exclude: ["Resources/Info.plist"],
            swiftSettings: [
                .swiftLanguageMode(.v6),
            ]
        ),
        .testTarget(
            name: "TokenHeroTests",
            dependencies: ["TokenHero"],
            path: "TokenHeroTests"
        ),
    ]
)
