-- V4__create_messages_table.sql
-- Create messages table

CREATE TABLE genu.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id VARCHAR(255) UNIQUE NOT NULL,
    chat_id VARCHAR(255) NOT NULL,
    user_id VARCHAR(255) NOT NULL,
    role VARCHAR(255) NOT NULL,
    content TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    FOREIGN KEY (chat_id) REFERENCES genu.chats(chat_id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES genu.users(user_id) ON DELETE CASCADE
);

-- Indexes for performance
CREATE INDEX idx_messages_chat_id ON genu.messages(chat_id);
CREATE INDEX idx_messages_user_id ON genu.messages(user_id);
CREATE INDEX idx_messages_created_at ON genu.messages(created_at);

-- Update trigger
CREATE TRIGGER update_messages_updated_at BEFORE UPDATE ON genu.messages FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();