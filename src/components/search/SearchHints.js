import React from 'react';
import { Link } from 'gatsby';

import { makeStyles } from '@material-ui/core/styles';
import { MenuBook, FormatQuote, PeopleAlt, Place } from '@material-ui/icons';
import { List, ListSubheader, ListItem, ListItemIcon, ListItemSecondaryAction, ListItemText, Divider } from '@material-ui/core';
import { Typography } from '@material-ui/core';

export default function SearchHints ({ searchUpdate }) {
    const classes = useStyles();
    return (
        <List subheader={<ListSubheader>Try searching for...</ListSubheader>}>
            <ListItem>
                <ListItemIcon>
                    <MenuBook className={classes.icon}/> 
                </ListItemIcon>
                <ListItemText primary="Bible References" />
                <ListItemSecondaryAction>
                    <Link to="/passages"><Typography variant="button">Browse</Typography></Link>
                </ListItemSecondaryAction>
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Prov 25:2')}}>Prov 25:2</Link>} />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Acts 13')}}>Acts 13</Link>} />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('John 3:16')}}>John 3:16</Link>} />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem>
                <ListItemIcon>
                    <FormatQuote className={classes.icon}/>
                </ListItemIcon>
                <ListItemText primary="Words or phrases" />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('in the beginning')}}>in the beginning</Link>} />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('search the scriptures')}}>search the scriptures</Link>} />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem>
                <ListItemIcon>
                    <PeopleAlt className={classes.icon}/> 
                </ListItemIcon>
                <ListItemText primary="People" />
                <ListItemSecondaryAction>
                    <Link to="/people"><Typography variant="button">Browse</Typography></Link>
                </ListItemSecondaryAction>
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Abraham')}}>Abraham</Link>} />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Saul')}}>Saul</Link>} />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Zechariah')}}>Zechariah</Link>} />
            </ListItem>

            <Divider variant="middle"/>

            <ListItem>
                <ListItemIcon>
                    <Place className={classes.icon}/> 
                </ListItemIcon>
                <ListItemText primary="Places" />
                <ListItemSecondaryAction>
                    <Link to="/places"><Typography variant="button">Browse</Typography></Link>
                </ListItemSecondaryAction>
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Bethlehem')}}>Bethlehem</Link>} />
            </ListItem>
            <ListItem class={classes.item}>
                <ListItemText inset primary={<Link to={'#'} onClick={() => {searchUpdate('Antioch')}}>Antioch</Link>} />
            </ListItem>

        </List>
    );
}

const useStyles = makeStyles(theme => ({
    item: {
        paddingLeft:16,
    },
    divider:{
        
    }
  }));