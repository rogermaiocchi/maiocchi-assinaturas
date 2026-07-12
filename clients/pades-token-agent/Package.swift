// swift-tools-version: 6.0
import PackageDescription

let package = Package(
    name: "MaiocchiPadesTokenAgent",
    platforms: [.macOS(.v14)],
    products: [
        .executable(name: "maiocchi-pades-agent", targets: ["MaiocchiPadesTokenAgent"])
    ],
    dependencies: [
        .package(url: "https://github.com/vapor/vapor.git", from: "4.115.0")
    ],
    targets: [
        .executableTarget(
            name: "MaiocchiPadesTokenAgent",
            dependencies: [.product(name: "Vapor", package: "vapor")]
        ),
        .testTarget(
            name: "MaiocchiPadesTokenAgentTests",
            dependencies: ["MaiocchiPadesTokenAgent"]
        )
    ]
)
