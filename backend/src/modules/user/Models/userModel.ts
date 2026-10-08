import {
  AutoIncrement,
  Column,
  DataType,
  Model,
  PrimaryKey,
  Table,
} from 'sequelize-typescript';

@Table({
  tableName: 'users',
  timestamps: false,
})
export default class User extends Model {
  @PrimaryKey
  @AutoIncrement
  @Column({
    type: DataType.INTEGER,
    allowNull: false,
  })
  declare id: number;

  // A display name only: not unique, and never used to log in
  @Column({
    type: DataType.STRING,
    allowNull: false,
  })
  declare username: string;

  // Identifies the account at login: one account per email address
  @Column({
    type: DataType.STRING,
    allowNull: false,
    unique: true,
  })
  declare email: string;

  // bcrypt hash, never the plaintext password. Null for accounts that only
  // sign in with Google.
  @Column({
    type: DataType.STRING,
    allowNull: true,
  })
  declare password: string | null;

  @Column({
    type: DataType.INTEGER,
    allowNull: false,
    defaultValue: 0,
  })
  declare status: number;

  @Column({
    type: DataType.BOOLEAN,
    allowNull: false,
    defaultValue: false,
  })
  declare emailVerified: boolean;

  // Google's stable account id (the `sub` claim), set once the account signs in with Google
  @Column({
    type: DataType.STRING,
    allowNull: true,
    unique: true,
  })
  declare googleId: string | null;

  // Keeps the password hash and the Google id out of every serialized user (API responses included)
  toJSON() {
    const values = { ...this.get() };
    delete values.password;
    delete values.googleId;
    return values;
  }
}
