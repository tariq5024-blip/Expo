const axios = require('axios');

// Test the hierarchy creation endpoints
async function testHierarchy() {
  try {
    // First, login to get a token
    const loginRes = await axios.post('http://localhost:5000/api/auth/login', {
      email: 'scy@expo.com',
      password: 'admin123'
    });
    
    const token = loginRes.data.token;
    const config = {
      headers: { Authorization: `Bearer ${token}` }
    };

    console.log('✓ Login successful');

    // Test 1: Create a category
    try {
      const categoryRes = await axios.post('http://localhost:5000/api/asset-categories', 
        { name: 'Test Category' }, 
        config
      );
      console.log('✓ Category created:', categoryRes.data.name);
      
      const categoryId = categoryRes.data._id;

      // Test 2: Add a type to the category
      try {
        const typeRes = await axios.post(`http://localhost:5000/api/asset-categories/${categoryId}/types`, 
          { name: 'Test Type' }, 
          config
        );
        console.log('✓ Type added:', typeRes.data.name);

        // Test 3: Add a product to the type
        try {
          const productRes = await axios.post(`http://localhost:5000/api/asset-categories/${categoryId}/types/Test Type/products`, 
            { name: 'Test Product' }, 
            config
          );
          console.log('✓ Product added:', productRes.data.name);

          // Test 4: Add a child product
          // First find a product ID
          const categoriesRes = await axios.get('http://localhost:5000/api/asset-categories', config);
          const testProduct = categoriesRes.data[0].types[0].products[0];
          
          if (testProduct) {
            try {
              const childRes = await axios.post(`http://localhost:5000/api/asset-categories/products/${testProduct._id}/children`, 
                { name: 'Test Child Product' }, 
                config
              );
              console.log('✓ Child product added');
            } catch (childErr) {
              console.log('✗ Child product creation failed:', childErr.response?.data?.message);
            }
          }

        } catch (productErr) {
          console.log('✗ Product creation failed:', productErr.response?.data?.message);
        }

      } catch (typeErr) {
        console.log('✗ Type creation failed:', typeErr.response?.data?.message);
      }

    } catch (categoryErr) {
      console.log('✗ Category creation failed:', categoryErr.response?.data?.message);
    }

  } catch (err) {
    console.log('✗ Login failed:', err.response?.data?.message || err.message);
  }
}

testHierarchy();