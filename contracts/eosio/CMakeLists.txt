cmake_minimum_required(VERSION 3.16)
project(tourisme)

find_package(cdt)

add_contract(tourisme tourisme src/tourisme.cpp)
target_include_directories(tourisme PUBLIC ${CMAKE_SOURCE_DIR}/include)
target_ricardian_directory(tourisme ${CMAKE_SOURCE_DIR}/ricardian)
