package repository

import (
	"github.com/example/go-backend/models"
	"gorm.io/gorm"
)

var db *gorm.DB

// InitDB initializes the database connection
func InitDB(database *gorm.DB) {
	db = database
}

// GetAllUsers retrieves all users from the database
func GetAllUsers() ([]models.User, error) {
	var users []models.User
	result := db.Find(&users)
	if result.Error != nil {
		return nil, result.Error
	}
	return users, nil
}

// GetUserByID retrieves a user by ID
func GetUserByID(id string) (*models.User, error) {
	var user models.User
	result := db.First(&user, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	return &user, nil
}

// CreateUser creates a new user in the database
func CreateUser(input *models.CreateUserInput) (*models.User, error) {
	user := &models.User{
		Name:  input.Name,
		Email: input.Email,
	}
	result := db.Create(user)
	if result.Error != nil {
		return nil, result.Error
	}
	return user, nil
}

// UpdateUser updates an existing user
func UpdateUser(id string, input *models.UpdateUserInput) (*models.User, error) {
	var user models.User
	result := db.First(&user, "id = ?", id)
	if result.Error != nil {
		return nil, result.Error
	}
	
	result = db.Model(&user).Updates(models.User{
		Name:  input.Name,
		Email: input.Email,
	})
	if result.Error != nil {
		return nil, result.Error
	}
	
	return &user, nil
}

// DeleteUser deletes a user from the database
func DeleteUser(id string) error {
	result := db.Delete(&models.User{}, "id = ?", id)
	return result.Error
}

// GetUsersByRole retrieves users by role using raw SQL
func GetUsersByRole(role string) ([]models.User, error) {
	var users []models.User
	result := db.Raw("SELECT * FROM users WHERE role = ?", role).Scan(&users)
	return users, result.Error
}
