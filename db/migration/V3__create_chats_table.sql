-- V3__create_chats_table.sql
-- Create chats table (from DynamoDB main table with id pattern "user#{userId}")

CREATE TABLE genu.chats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    chat_id VARCHAR(255) UNIQUE NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    title VARCHAR(255),
    usecase VARCHAR(255),  -- usecase type
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (user_id) REFERENCES genu.users(user_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_chats_user_id ON genu.chats(user_id);
CREATE INDEX idx_chats_created_at ON genu.chats(created_at);
CREATE INDEX idx_chats_usecase ON genu.chats(usecase);

-- Update trigger
CREATE TRIGGER update_chats_updated_at BEFORE UPDATE ON genu.chats FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();