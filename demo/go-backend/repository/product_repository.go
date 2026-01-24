package repository

import (
	"github.com/example/go-backend/models"
)

// GetAllProducts retrieves all products from the database
func GetAllProducts() ([]models.Product, error) {
	var products []models.Product
	result := db.Find(&products)
	if result.Error != nil {
		return nil, result.Error
	}
	return products, nil
}

// GetProductByID retrieves a product by ID
func GetProductByID(id string) (*models.Product, error) {
	var product models.Product
	result := db.First(&product, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &product, nil
}

// CreateProduct creates a new product
func CreateProduct(input *models.CreateProductInput) (*models.Product, error) {
	product := &models.Product{
		Name:  input.Name,
		Price: input.Price,
	}
	result := db.Create(product)
	if result.Error != nil {
		return nil, result.Error
	}
	return product, nil
}
