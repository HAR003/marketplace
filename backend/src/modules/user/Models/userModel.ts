import {AutoIncrement, Model, PrimaryKey, Table, Column, DataType} from "sequelize-typescript";

@Table({
    tableName: 'users',
    timestamps: false
})

export default class User extends Model {
    @PrimaryKey
    @AutoIncrement
    @Column({
        type: DataType.INTEGER,
        allowNull: false
    })
    declare id: number

    @Column({
        type: DataType.STRING,
        allowNull: false,
    })
    declare  username: string

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare email: string

    @Column({
        type: DataType.STRING,
        allowNull: false
    })
    declare password: string

    @Column({
        type: DataType.INTEGER,
        allowNull: false,
        defaultValue: 0
    })
    declare status: number
}