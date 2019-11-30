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
            <ListItem  className={classes.padding}>
                <ListItemIcon className={classes.icon}>
                    {/* <MenuBook/>  */}
                    <span role="img" aria-label="book">📖</span>
                </ListItemIcon>
                <ListItemText primary="Bible References" />
                <ListItemSecondaryAction>
                    <Link to="/passages"><Typography variant="button">Browse</Typography></Link>
                </ListItemSecondaryAction>
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#prov_25_2'} onClick={() => {searchUpdate('Prov 25:2')}}>Prov 25:2</Link>} />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#acts_13'} onClick={() => {searchUpdate('Acts 13')}}>Acts 13</Link>} />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#john_3_16'} onClick={() => {searchUpdate('John 3:16')}}>John 3:16</Link>} />
            </ListItem>

            <Divider className={classes.root} variant="middle"/>

            <ListItem  className={classes.padding}>
                <ListItemIcon className={classes.icon}>
                    <FormatQuote/>
                </ListItemIcon>
                <ListItemText primary="Words or phrases" />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#in_the_beginning'} onClick={() => {searchUpdate('in the beginning')}}>in the beginning</Link>} />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#search_the_scriptures'} onClick={() => {searchUpdate('search the scriptures')}}>search the scriptures</Link>} />
            </ListItem>

            <Divider className={classes.root} variant="middle"/>

            <ListItem  className={classes.padding}>
                <ListItemIcon className={classes.icon}>
                    {/* <PeopleAlt/>  */}
                    <span role="img" aria-label="people">👥</span>
                </ListItemIcon>
                <ListItemText primary="People" />
                <ListItemSecondaryAction>
                    <Link to="/people"><Typography variant="button">Browse</Typography></Link>
                </ListItemSecondaryAction>
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#abraham'} onClick={() => {searchUpdate('Abraham')}}>Abraham</Link>} />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#saul'} onClick={() => {searchUpdate('Saul')}}>Saul</Link>} />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#zechariah'} onClick={() => {searchUpdate('Zechariah')}}>Zechariah</Link>} />
            </ListItem>

            <Divider className={classes.root} variant="middle"/>

            <ListItem  className={classes.padding}>
                <ListItemIcon className={classes.icon}>
                    {/* <Place/>  */}
                    <span role="img" aria-label="places">📍</span>
                </ListItemIcon>
                <ListItemText primary="Places" />
                <ListItemSecondaryAction>
                    <Link to="/places"><Typography variant="button">Browse</Typography></Link>
                </ListItemSecondaryAction>
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#bethlehem'} onClick={() => {searchUpdate('Bethlehem')}}>Bethlehem</Link>} />
            </ListItem>
            <ListItem  className={classes.padding}>
                <ListItemText inset primary={<Link to={'#antioch'} onClick={() => {searchUpdate('Antioch')}}>Antioch</Link>} />
            </ListItem>

        </List>
    );
}

const useStyles = makeStyles(theme => ({
    root: {
        marginTop:15,
        marginBottom:15,
    },
    padding:{
        paddingTop:0,
        paddingBottom:0,
    },
    icon: {
        color:"#000",
    }
  }));