package main

import (
	"github.com/gin-gonic/gin"
	"github.com/example/go-backend/handlers"
	"github.com/example/go-backend/middleware"
)

func main() {
	r := gin.Default()

	// Middleware
	r.Use(middleware.AuthMiddleware())
	r.Use(middleware.LoggingMiddleware())

	// Routes
	api := r.Group("/api/v1")
	{
		api.GET("/users", handlers.GetUsers)
		api.GET("/users/:id", handlers.GetUser)
		api.POST("/users", handlers.CreateUser)
		api.PUT("/users/:id", handlers.UpdateUser)
		api.DELETE("/users/:id", handlers.DeleteUser)

		api.GET("/products", handlers.GetProducts)
		api.POST("/products", handlers.CreateProduct)
	}

	r.Run(":8080")
}
