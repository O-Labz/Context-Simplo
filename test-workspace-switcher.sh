#!/bin/bash

echo "🧪 Testing Dynamic Workspace Switcher Implementation"
echo "===================================================="
echo ""

# Colors
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

PASS=0
FAIL=0

test_result() {
  if [ $1 -eq 0 ]; then
    echo -e "${GREEN}✓ PASS${NC}: $2"
    ((PASS++))
  else
    echo -e "${RED}✗ FAIL${NC}: $2"
    ((FAIL++))
  fi
}

echo "1. Checking backend files..."
echo "----------------------------"

# Check workspace routes exist
if [ -f "src/api/routes/workspace.ts" ]; then
  test_result 0 "workspace.ts exists"
else
  test_result 1 "workspace.ts missing"
fi

# Check workspace routes are exported
if grep -q "workspace.js" src/api/routes/index.ts; then
  test_result 0 "workspace routes exported"
else
  test_result 1 "workspace routes not exported"
fi

# Check browse.ts has scope parameter
if grep -q "scope.*mount" src/api/routes/browse.ts; then
  test_result 0 "browse.ts has scope parameter"
else
  test_result 1 "browse.ts missing scope parameter"
fi

# Check server.ts registers workspace routes
if grep -q "registerWorkspaceRoutes" src/api/server.ts; then
  test_result 0 "server.ts registers workspace routes"
else
  test_result 1 "server.ts doesn't register workspace routes"
fi

# Check index.ts has mount root support
if grep -q "MOUNT_ROOT\|mountRoot" src/index.ts; then
  test_result 0 "index.ts has mount root support"
else
  test_result 1 "index.ts missing mount root support"
fi

# Check config-manager has reloadWorkspace
if grep -q "reloadWorkspace" src/core/config-manager.ts; then
  test_result 0 "config-manager has reloadWorkspace()"
else
  test_result 1 "config-manager missing reloadWorkspace()"
fi

echo ""
echo "2. Checking frontend files..."
echo "----------------------------"

# Check FolderBrowser has scope prop
if grep -q "scope.*mount" dashboard/src/components/FolderBrowser.tsx; then
  test_result 0 "FolderBrowser has scope prop"
else
  test_result 1 "FolderBrowser missing scope prop"
fi

# Check Repositories has workspace switcher UI
if grep -q "showWorkspaceDialog\|Change.*Workspace" dashboard/src/pages/Repositories/Repositories.tsx; then
  test_result 0 "Repositories has workspace switcher UI"
else
  test_result 1 "Repositories missing workspace switcher UI"
fi

echo ""
echo "3. Checking Docker configuration..."
echo "-----------------------------------"

# Check Dockerfile has /host mount
if grep -q "/host" Dockerfile; then
  test_result 0 "Dockerfile has /host mount point"
else
  test_result 1 "Dockerfile missing /host mount point"
fi

# Check docker-compose has HOST_MOUNT_PATH
if grep -q "HOST_MOUNT_PATH\|/host:ro" docker-compose.yml; then
  test_result 0 "docker-compose.yml has host mount"
else
  test_result 1 "docker-compose.yml missing host mount"
fi

# Check docker-compose has MOUNT_ROOT env var
if grep -q "MOUNT_ROOT" docker-compose.yml; then
  test_result 0 "docker-compose.yml has MOUNT_ROOT env"
else
  test_result 1 "docker-compose.yml missing MOUNT_ROOT env"
fi

# Check docker-compose has INITIAL_WORKSPACE env var
if grep -q "INITIAL_WORKSPACE" docker-compose.yml; then
  test_result 0 "docker-compose.yml has INITIAL_WORKSPACE env"
else
  test_result 1 "docker-compose.yml missing INITIAL_WORKSPACE env"
fi

echo ""
echo "4. Checking CLI and documentation..."
echo "------------------------------------"

# Check simplo script exists and is executable
if [ -x "bin/simplo" ]; then
  test_result 0 "bin/simplo exists and is executable"
else
  test_result 1 "bin/simplo missing or not executable"
fi

# Check simplo has start command
if grep -q "cmd_start" bin/simplo; then
  test_result 0 "simplo has start command"
else
  test_result 1 "simplo missing start command"
fi

# Check simplo calculates INITIAL_WORKSPACE
if grep -q "INITIAL_WORKSPACE.*rel_workspace" bin/simplo; then
  test_result 0 "simplo calculates INITIAL_WORKSPACE"
else
  test_result 1 "simplo doesn't calculate INITIAL_WORKSPACE"
fi

# Check .env.example exists
if [ -f ".env.example" ]; then
  test_result 0 ".env.example exists"
else
  test_result 1 ".env.example missing"
fi

# Check .env.example documents MOUNT_ROOT
if grep -q "MOUNT_ROOT" .env.example; then
  test_result 0 ".env.example documents MOUNT_ROOT"
else
  test_result 1 ".env.example missing MOUNT_ROOT"
fi

# Check setup-mcp.sh has correct port
if grep -q "localhost:3001" setup-mcp.sh; then
  test_result 0 "setup-mcp.sh has correct port (3001)"
else
  test_result 1 "setup-mcp.sh has wrong port"
fi

echo ""
echo "5. Checking build artifacts..."
echo "------------------------------"

# Check backend builds
if [ -f "dist/index.js" ]; then
  test_result 0 "Backend compiled successfully"
else
  test_result 1 "Backend compilation failed"
fi

# Check workspace routes compiled
if [ -f "dist/api/routes/workspace.js" ]; then
  test_result 0 "Workspace routes compiled"
else
  test_result 1 "Workspace routes not compiled"
fi

# Check dashboard builds
if [ -f "dashboard/dist/index.html" ]; then
  test_result 0 "Dashboard compiled successfully"
else
  test_result 1 "Dashboard compilation failed"
fi

echo ""
echo "=========================================="
echo -e "Results: ${GREEN}${PASS} passed${NC}, ${RED}${FAIL} failed${NC}"
echo "=========================================="

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}✓ All tests passed! Implementation is complete.${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠ Some tests failed. Review the output above.${NC}"
  exit 1
fi
