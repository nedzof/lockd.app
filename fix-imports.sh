#!/bin/bash

# Update the BSVStats.tsx file specifically
sed -i 's|import { API_URL } from ".*config";|import { API_URL } from "../../config";|g' src/frontend/components/charts/BSVStats.tsx

echo "Import paths fixed!" 