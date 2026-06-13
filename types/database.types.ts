/**
 * Supabase schema types for OceanCore (restaurant concierge).
 * Keep in sync with supabase/migrations/*.sql
 */
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  public: {
    Tables: {
      businesses: {
        Row: {
          id: string
          user_id: string
          name: string
          email: string | null
          phone: string | null
          address: string | null
          business_type: string
          agent_name: string | null
          system_prompt: string | null
          language: string | null
          menu_pdf_text: string | null
          operating_hours: Json
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          user_id: string
          name: string
          email?: string | null
          phone?: string | null
          address?: string | null
          business_type?: string
          agent_name?: string | null
          system_prompt?: string | null
          language?: string | null
          menu_pdf_text?: string | null
          operating_hours?: Json
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['businesses']['Insert']>
      }
      services: {
        Row: {
          id: string
          business_id: string
          name: string
          price: number | null
          description: string | null
          category: string | null
          duration_minutes: number | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name: string
          price?: number | null
          description?: string | null
          category?: string | null
          duration_minutes?: number | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['services']['Insert']>
      }
      customers: {
        Row: {
          id: string
          business_id: string
          name: string
          email: string | null
          phone: string | null
          tags: Json | null
          phone_raw: string | null
          preferred_staff: string | null
          total_bookings: number | null
          total_spent: number | null
          visit_history: Json | null
          last_visit: string | null
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          name?: string
          email?: string | null
          phone?: string | null
          phone_raw?: string | null
          tags?: Json | null
          preferred_staff?: string | null
          total_bookings?: number | null
          total_spent?: number | null
          visit_history?: Json | null
          last_visit?: string | null
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['customers']['Insert']>
      }
      conversations: {
        Row: {
          id: string
          business_id: string
          customer_id: string | null
          customer_name: string | null
          status: string
          updated_at: string
          created_at: string
        }
        Insert: {
          id?: string
          business_id: string
          customer_id?: string | null
          customer_name?: string | null
          status?: string
          updated_at?: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['conversations']['Insert']>
      }
      messages: {
        Row: {
          id: string
          conversation_id: string
          role: string
          content: string
          created_at: string
        }
        Insert: {
          id?: string
          conversation_id: string
          role: string
          content: string
          created_at?: string
        }
        Update: Partial<Database['public']['Tables']['messages']['Insert']>
      }
      appointments: {
        Row: {
          id: string
          business_id: string
          customer_id: string | null
          conversation_id: string | null
          service_name: string | null
          scheduled_at: string
          status: string
          notes: string | null
          created_at: string
          updated_at: string
        }
        Insert: {
          id?: string
          business_id: string
          customer_id?: string | null
          conversation_id?: string | null
          service_name?: string | null
          scheduled_at: string
          status?: string
          notes?: string | null
          created_at?: string
          updated_at?: string
        }
        Update: Partial<Database['public']['Tables']['appointments']['Insert']>
      }
    }
    Views: Record<string, never>
    Functions: Record<string, never>
  }
}

export type MenuItem = Database['public']['Tables']['services']['Row']
export type Reservation = Database['public']['Tables']['appointments']['Row']
