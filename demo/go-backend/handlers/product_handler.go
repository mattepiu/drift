package handlers

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/example/go-backend/repository"
)

// GetProducts returns all products
func GetProducts(c *gin.Context) {
	products, err := repository.GetAllProducts()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}
	c.JSON(http.StatusOK, products)
}

// CreateProduct creates a new product
func CreateProduct(c *gin.Context) {
	// Implementation
	c.JSON(http.StatusCreated, gin.H{"message": "created"})
}
